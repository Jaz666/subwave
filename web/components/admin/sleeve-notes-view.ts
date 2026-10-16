import type {ConnectionNode} from './connections/types';

export function groupAiredStories<T extends {id:string;segmentId?:string|null;conversation?:{id:string}|null}>(items:readonly T[]) {
  const groups=new Map<string,T[]>();
  for(const item of items) {
    const key=item.conversation?.id??item.segmentId??item.id;
    groups.set(key,[...(groups.get(key)??[]),item]);
  }
  return groups;
}

export function storiesHref(node:Pick<ConnectionNode,'id'|'entityType'|'entityId'|'title'>,query:string):string {
  const params=new URLSearchParams(query);
  params.set('tab','stories');params.set('from','brain');params.set('brainSelected',node.id);
  if(['artist','recording','release','release-group'].includes(node.entityType)) {
    params.delete('q');params.set('storyType',node.entityType);params.set('storyId',node.entityId);params.set('storyName',node.title);
  } else {
    params.delete('storyType');params.delete('storyId');params.set('q',node.title);
  }
  return `/admin/notes?${params}`;
}
