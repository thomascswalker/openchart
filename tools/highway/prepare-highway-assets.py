#!/usr/bin/env python3
"""Convert the supplied circular highway FBX files to self-contained GLB assets.

The project deliberately keeps this converter in the repository instead of
depending on a Node-only FBX loader.  It understands the Blender-exported FBX
7400 subset used by the supplied assets: geometry, polygon indices, normals,
UVs, and the global axis metadata.  The generated GLBs embed their PNGs so
Vite and Tauri resolve them identically.
"""

from __future__ import annotations

import json
import struct
import sys
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


@dataclass
class Node:
    name: str
    properties: list[Any]
    children: list["Node"] = field(default_factory=list)


def read_property(data: bytes, offset: int) -> tuple[Any, int]:
    kind = chr(data[offset])
    offset += 1
    scalar_formats = {
        "Y": ("h", 2),
        "C": ("?", 1),
        "I": ("i", 4),
        "F": ("f", 4),
        "D": ("d", 8),
        "L": ("q", 8),
    }
    if kind in scalar_formats:
        fmt, size = scalar_formats[kind]
        return struct.unpack_from("<" + fmt, data, offset)[0], offset + size

    if kind in "fdlib":
        count, encoding, byte_count = struct.unpack_from("<III", data, offset)
        offset += 12
        raw = data[offset : offset + byte_count]
        offset += byte_count
        if encoding:
            raw = zlib.decompress(raw)
        fmt = {"f": "f", "d": "d", "l": "q", "i": "i", "b": "?"}[kind]
        return list(struct.unpack("<" + fmt * count, raw)), offset

    if kind in "SR":
        length = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        if kind == "R":
            return data[offset : offset + length], offset + length
        return data[offset : offset + length].decode("utf-8", "replace"), offset + length

    raise ValueError(f"Unsupported FBX property type {kind!r}")


def parse_nodes(data: bytes, start: int, end: int) -> list[Node]:
    nodes: list[Node] = []
    offset = start
    while offset + 13 <= end:
        end_offset, property_count, _property_length = struct.unpack_from(
            "<III", data, offset
        )
        name_length = data[offset + 12]
        if end_offset == 0:
            break

        name_start = offset + 13
        name = data[name_start : name_start + name_length].decode("latin1")
        cursor = name_start + name_length
        properties: list[Any] = []
        for _ in range(property_count):
            value, cursor = read_property(data, cursor)
            properties.append(value)

        children = (
            parse_nodes(data, cursor, end_offset)
            if end_offset - cursor >= 13
            else []
        )
        nodes.append(Node(name, properties, children))
        offset = end_offset
    return nodes


def walk(nodes: Iterable[Node]) -> Iterable[Node]:
    for node in nodes:
        yield node
        yield from walk(node.children)


def first_child(node: Node, name: str) -> Node | None:
    return next((child for child in node.children if child.name == name), None)


def first_node(nodes: Iterable[Node], name: str) -> Node | None:
    return next((node for node in walk(nodes) if node.name == name), None)


def source_material_count(nodes: list[Node]) -> int:
    return sum(1 for node in walk(nodes) if node.name == "Material")


def parse_geometry(path: Path) -> tuple[list[float], list[int], list[float], list[float], int]:
    data = path.read_bytes()
    if not data.startswith(b"Kaydara FBX Binary"):
        raise ValueError(f"{path.name} is not a binary FBX file")
    nodes = parse_nodes(data, 27, len(data))
    geometry = first_node(nodes, "Geometry")
    if geometry is None:
        raise ValueError(f"{path.name} does not contain a Geometry node")

    vertices_node = first_child(geometry, "Vertices")
    polygons_node = first_child(geometry, "PolygonVertexIndex")
    if vertices_node is None or polygons_node is None:
        raise ValueError(f"{path.name} is missing vertices or polygon indices")

    normal_layer = first_child(geometry, "LayerElementNormal")
    normals_node = first_child(normal_layer, "Normals") if normal_layer else None
    uv_layer = first_child(geometry, "LayerElementUV")
    uv_node = first_child(uv_layer, "UV") if uv_layer else None
    uv_index_node = first_child(uv_layer, "UVIndex") if uv_layer else None
    if normals_node is None or uv_node is None or uv_index_node is None:
        raise ValueError(f"{path.name} is missing normals or UV data")

    vertices = vertices_node.properties[0]
    polygon_indices = polygons_node.properties[0]
    normals = normals_node.properties[0]
    uvs = uv_node.properties[0]
    uv_indices = uv_index_node.properties[0]

    # FBX polygon indices terminate a face with the bitwise-complemented last
    # index.  Expand every polygon into a triangle fan while preserving the
    # per-polygon-vertex normal and UV streams.
    output_positions: list[float] = []
    output_normals: list[float] = []
    output_uvs: list[float] = []
    output_indices: list[int] = []
    polygon_corners: list[tuple[int, int, int]] = []
    corner = 0
    polygon: list[int] = []

    def flush_polygon() -> None:
        nonlocal polygon, corner
        if len(polygon) < 3:
            corner += len(polygon)
            polygon = []
            return
        base = len(output_positions) // 3
        for index in polygon:
            output_positions.extend(vertices[index * 3 : index * 3 + 3])
            output_normals.extend(normals[corner * 3 : corner * 3 + 3])
            uv_index = uv_indices[corner]
            output_uvs.extend(uvs[uv_index * 2 : uv_index * 2 + 2])
            corner += 1
        for index in range(1, len(polygon) - 1):
            output_indices.extend((base, base + index, base + index + 1))
        polygon = []

    for raw_index in polygon_indices:
        is_last = raw_index < 0
        polygon.append(-raw_index - 1 if is_last else raw_index)
        if is_last:
            flush_polygon()
    flush_polygon()

    if not output_indices:
        raise ValueError(f"{path.name} produced no triangles")
    return (
        output_positions,
        output_indices,
        output_normals,
        output_uvs,
        source_material_count(nodes),
    )


def aligned(value: int, alignment: int = 4) -> int:
    return (value + alignment - 1) & ~(alignment - 1)


def make_glb(
    positions: list[float],
    indices: list[int],
    normals: list[float],
    uvs: list[float],
    base_texture: Path,
    emission_texture: Path | None,
    source_name: str,
) -> bytes:
    binary = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []

    def append_buffer(raw: bytes, target: int | None = None) -> int:
        start = aligned(len(binary))
        binary.extend(b"\0" * (start - len(binary)))
        binary.extend(raw)
        view: dict[str, Any] = {"buffer": 0, "byteOffset": start, "byteLength": len(raw)}
        if target is not None:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def add_float_accessor(values: list[float], components: int) -> int:
        view = append_buffer(struct.pack("<" + "f" * len(values), *values), 34962)
        count = len(values) // components
        accessor: dict[str, Any] = {
            "bufferView": view,
            "componentType": 5126,
            "count": count,
            "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3"}[components],
        }
        if components == 3:
            accessor["min"] = [min(values[i::3]) for i in range(3)]
            accessor["max"] = [max(values[i::3]) for i in range(3)]
        accessors.append(accessor)
        return len(accessors) - 1

    position_accessor = add_float_accessor(positions, 3)
    normal_accessor = add_float_accessor(normals, 3)
    uv_accessor = add_float_accessor(uvs, 2)
    index_view = append_buffer(struct.pack("<" + "I" * len(indices), *indices), 34963)
    accessors.append(
        {
            "bufferView": index_view,
            "componentType": 5125,
            "count": len(indices),
            "type": "SCALAR",
            "min": [min(indices)],
            "max": [max(indices)],
        }
    )
    index_accessor = len(accessors) - 1

    images: list[dict[str, Any]] = []
    textures: list[dict[str, Any]] = []
    material: dict[str, Any] = {
        "name": f"{source_name}Circular",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicFactor": 0.0,
            "roughnessFactor": 0.8,
        },
        "alphaMode": "BLEND" if emission_texture else "OPAQUE",
        "doubleSided": True,
        "extras": {"sourceBaseColor": base_texture.name},
    }

    def add_image(path: Path) -> int:
        view = append_buffer(path.read_bytes())
        images.append(
            {"name": path.name, "bufferView": view, "mimeType": "image/png"}
        )
        textures.append({"source": len(images) - 1})
        return len(images) - 1

    add_image(base_texture)
    if emission_texture is not None:
        emission_index = add_image(emission_texture)
        material["emissiveTexture"] = {"index": emission_index}
        material["emissiveFactor"] = [1.0, 1.0, 1.0]

    gltf = {
        "asset": {"version": "2.0", "generator": "midiview FBX preparation"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": source_name, "mesh": 0}],
        "meshes": [
            {
                "name": source_name,
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": position_accessor,
                            "NORMAL": normal_accessor,
                            "TEXCOORD_0": uv_accessor,
                        },
                        "indices": index_accessor,
                        "material": 0,
                    }
                ],
            }
        ],
        "materials": [material],
        "textures": textures,
        "images": images,
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "extras": {
            "source": source_name + ".fbx",
            "coordinateSystem": {
                "handedness": "right-handed",
                "upAxis": "Y",
                "forwardAxis": "-Z",
                "unitScale": 1.0,
            },
            "preservedAttributes": ["POSITION", "NORMAL", "TEXCOORD_0"],
        },
    }
    json_chunk = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * (aligned(len(json_chunk)) - len(json_chunk))
    bin_chunk = bytes(binary) + b"\0" * (aligned(len(binary)) - len(binary))
    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    return b"glTF" + struct.pack("<II", 2, total_length) + struct.pack(
        "<I4s", len(json_chunk), b"JSON"
    ) + json_chunk + struct.pack("<I4s", len(bin_chunk), b"BIN\0") + bin_chunk


def convert_one(source: Path, runtime: Path, base: Path, emission: Path | None) -> dict[str, Any]:
    positions, indices, normals, uvs, source_materials = parse_geometry(source)
    runtime.write_bytes(
        make_glb(positions, indices, normals, uvs, base, emission, source.stem)
    )
    return {
        "source": source.name,
        "runtime": runtime.name,
        "sourceMeshCount": 1,
        "sourceMaterialCount": source_materials,
        "runtimeMeshCount": 1,
        "runtimeMaterialCount": 1,
        "vertexCount": len(positions) // 3,
        "triangleCount": len(indices) // 3,
        "textures": {
            "baseColor": base.name,
            "emission": emission.name if emission else None,
        },
        "coordinateSystem": {
            "handedness": "right-handed",
            "upAxis": "Y",
            "forwardAxis": "-Z",
            "unitScale": 1.0,
            "pivot": "FBX object origin preserved",
        },
    }


def main() -> int:
    root = Path(__file__).resolve().parents[2] / "apps/editor/src/assets/highway/circular"
    source = root / "source"
    runtime = root / "runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1,
        "authoritativeSource": "source/*.fbx and source/*.png",
        "assets": [
            convert_one(
                source / "FretTop.fbx",
                runtime / "FretTop.glb",
                source / "Fret.png",
                None,
            ),
            convert_one(
                source / "FretBase.fbx",
                runtime / "FretBase.glb",
                source / "Fret.png",
                None,
            ),
            convert_one(
                source / "Note.fbx",
                runtime / "Note.glb",
                source / "Note.png",
                source / "NoteEmission.png",
            ),
        ],
        "checks": {
            "preserveNormals": True,
            "preserveUvs": True,
            "replaceEmbeddedNoteTexture": {
                "from": "Circle_Note_Texture.png",
                "to": "Note.png",
            },
            "expectedRuntimeMeshCount": 1,
            "expectedRuntimeMaterialCount": 1,
        },
    }
    manifest_path = runtime / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
