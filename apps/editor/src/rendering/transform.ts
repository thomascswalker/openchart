import * as THREE from "three";

export class Transform {
  public position: THREE.Vector3;
  public rotation: THREE.Quaternion;
  public scale: THREE.Vector3;

  constructor(
    position = new THREE.Vector3(0, 0, 0),
    rotation = new THREE.Quaternion(0, 0, 0, 1),
    scale = new THREE.Vector3(1, 1, 1),
  ) {
    this.position = position.clone();
    this.rotation = rotation.clone(); // Prefers Quaternions for robust rotation math
    this.scale = scale.clone();
  }

  public static getFrom(object: THREE.Object3D) {
    return new Transform().setFrom(object);
  }

  public setFrom(object: THREE.Object3D) {
    this.position.copy(object.position);
    this.rotation.copy(object.quaternion);
    this.scale.copy(object.scale);
    return this;
  }

  public applyTo(object: THREE.Object3D) {
    object.position.copy(this.position);
    object.quaternion.copy(this.rotation);
    object.scale.copy(this.scale);
    return this;
  }

  public matrix4(outMatrix = new THREE.Matrix4()) {
    return outMatrix.compose(this.position, this.rotation, this.scale);
  }

  public rotationEuler(): THREE.Euler {
    return new THREE.Euler().setFromQuaternion(this.rotation, "XYZ");
  }

  public rotationDegrees(): THREE.Vector3 {
    const euler = this.rotationEuler();
    return new THREE.Vector3(
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    );
  }

  public decompose(matrix: THREE.Matrix4) {
    matrix.decompose(this.position, this.rotation, this.scale);
    return this;
  }

  public clone() {
    return new Transform(this.position, this.rotation, this.scale);
  }
}
