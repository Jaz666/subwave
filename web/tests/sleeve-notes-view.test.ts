import test from 'node:test';
import assert from 'node:assert/strict';
import {groupAiredStories,storiesHref} from '../components/admin/sleeve-notes-view';

test('grouped transcripts retain separate story IDs and independent DJ links',()=>{
 const groups=groupAiredStories([{id:'one',segmentId:'segment'},{id:'two',segmentId:'segment'},{id:'link-one'},{id:'link-two'}]);
 assert.equal(groups.size,3);assert.deepEqual(groups.get('segment')?.map(item=>item.id),['one','two']);
});

test('a dossier link preserves the selected subject and map location for return',()=>{
 const href=storiesHref({id:'release-group:album',entityType:'release-group',entityId:'album',title:'An Album'},'tab=connections&focusType=artist&focusId=artist&edge=writer');
 const params=new URL(href,'https://example.test').searchParams;
 assert.equal(params.get('storyType'),'release-group');assert.equal(params.get('storyId'),'album');
 assert.equal(params.get('focusId'),'artist');assert.equal(params.get('brainSelected'),'release-group:album');
 assert.equal(params.get('from'),'brain');
 const library=new URL(storiesHref({id:'library-album:local',entityType:'library-album',entityId:'local',title:'Local Album'},params.toString()),'https://example.test');
 assert.equal(library.searchParams.get('q'),'Local Album');assert.equal(library.searchParams.has('storyId'),false);
});
