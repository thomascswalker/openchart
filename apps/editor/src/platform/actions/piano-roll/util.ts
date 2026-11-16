import { type EntityId, EntityType, parseEntityFromId } from '@openchart/views';

export function parseSelectedNoteEntityIds(ids: readonly string[]): EntityId[] {
  return ids.flatMap((id) => {
    const entity = parseEntityFromId(id);
    return entity?.type === EntityType.Note ? [id as EntityId] : [];
  });
}
