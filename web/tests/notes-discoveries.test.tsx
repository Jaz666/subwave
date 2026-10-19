import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import ExternalDiscoveries from '../components/admin/connections/ExternalDiscoveries';
test('discoveries render ranked artists with collapsed examples and refresh',()=>{
 const client=new QueryClient();
 client.setQueryData(['sleeve-notes','external-discoveries'],{calculatedAt:'2026-10-19T10:00:00Z',externalArtists:1,
 mostConnected:[{artist:'External',references:4,libraryArtists:2,sources:3,users:1,examples:[{artist:'Local',track:'Song',targetTrack:'Outside song',type:'samples'}]}],sampleSources:[],sampleUsers:[]});
 const html=renderToStaticMarkup(<QueryClientProvider client={client}><ExternalDiscoveries adminFetch={async()=>{throw Error('No network');}} timezone="Europe/London"/></QueryClientProvider>);
 assert.match(html,/Stats|Most connected/);assert.match(html,/2 library artists/);
 assert.match(html,/Refresh/);assert.match(html,/Example connections/);
 assert.match(html,/tab=stories/);assert.doesNotMatch(html,/<details[^>]* open/);
 client.clear();
});
