import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BookOpen} from 'lucide-react';
import NotesRecentlyAired from '../components/admin/NotesRecentlyAired';
import NotesLiveSummary from '../components/admin/NotesLiveSummary';
import {SectionTabs} from '../components/admin/SectionTabs';
import {Card} from '../components/admin/ui';
import type {ComponentProps} from 'react';
import {ResearchActivity,ResearchDetailsView} from '../components/admin/NotesPanel';

const fetcher=async()=>{throw new Error('No network in render checks');};

test('Recently aired shows the last two exchanges once with full confirmed speaker turns',()=>{
  const client=new QueryClient();
  const item={id:'one',segmentId:'segment',artist:'Example Band',title:'Recent track',airedAt:'2026-10-17T12:00:00Z',spokenText:'An excerpt.',
    conversation:{id:'segment',lines:[{speakerName:'Host',text:'A confirmed introduction.'},{speakerName:'Guest',text:'A confirmed reply.'}]}};
  client.setQueryData(['sleeve-notes','heard-on-air',0,'','','','detected'],{items:[item,{...item,id:'two'},
    {...item,id:'three',segmentId:null,title:'Previous track',conversation:null,review:{id:'review',state:'queued'}},
    {...item,id:'four',segmentId:null,title:'Older track',conversation:null}]});
  const html=renderToStaticMarkup(<QueryClientProvider client={client}><NotesRecentlyAired adminFetch={fetcher}/></QueryClientProvider>);
  assert.equal(html.split('Recent track').length-1,2,'one visible heading and its title attribute');
  assert.match(html,/Previous track/);assert.doesNotMatch(html,/Older track/);
  assert.match(html,/Host: A confirmed introduction/);assert.match(html,/Guest: A confirmed reply/);
  assert.match(html,/line-clamp-2/);assert.match(html,/tab=heard/);assert.doesNotMatch(html,/Offered Spark|Source passage/);
  assert.equal((html.match(/aria-pressed="false"/g)||[]).length,1);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(html,/aria-label="Flag for review"/);assert.match(html,/aria-label="Flagged for review"/);
  assert.match(html,/fill="currentColor"/);
  client.clear();
});

test('the Overview uses one responsive grid for all four boxes',()=>{
  const client=new QueryClient();client.setQueryData(['sleeve-notes','live-summary'],{onAir:null,nextUp:null});
  const html=renderToStaticMarkup(<QueryClientProvider client={client}><NotesLiveSummary adminFetch={fetcher} enabled>
    <Card title="Recently aired"/><Card title="Research activity"/>
  </NotesLiveSummary></QueryClientProvider>);
  assert.equal((html.match(/data-card=/g)||[]).length,4);assert.match(html,/md:grid-cols-2/);
  assert.match(html,/Run Segment/);assert.doesNotMatch(html,/Run now/);
  assert.match(html,/Recently aired/);assert.match(html,/Research activity/);client.clear();
});

test('a ready review count is highlighted and has an accessible explanation',()=>{
  const html=renderToStaticMarkup(<SectionTabs tabs={[{id:'review',label:'Review',icon:BookOpen,count:2,attention:true}]}
    value="overview" onChange={()=>{}} label="Sleeve Notes sections"/>);
  assert.match(html,/Review ready for your input/);assert.match(html,/02/);assert.match(html,/ready for your input/);
  assert.match(html,/bg-ink text-bg/);
});


test('Research activity shows the first two queued jobs and offers expansion for the rest',()=>{
  const jobs=['First job','Second job','Third job'].map((title,index)=>({id:String(index),subjectTitle:title,subjectArtist:'Artist',
    phase:'ready' as const,provider:'researcher',capability:'extract-wikipedia',subjectType:'artist',priority:300-index,
    attempts:0,runAfter:null,wikiNextChunk:0,researchNextSection:0}));
  const data={workQueueItems:jobs,workQueue:[{phase:'ready',jobs:3}],retainedClaims:12,localAttachments:2,
    musicBrainzSeries:[],providerSummary:[]} as unknown as ComponentProps<typeof ResearchActivity>['data'];
  const status={enabled:true} as ComponentProps<typeof ResearchActivity>['status'];
  const html=renderToStaticMarkup(<ResearchActivity data={data} status={status}/>);
  assert.match(html,/First job/);assert.match(html,/Second job/);assert.doesNotMatch(html,/Third job/);
  assert.match(html,/Show more \(1 more job\)/);assert.match(html,/aria-expanded="false"/);
  assert.doesNotMatch(html,/Research details|Recent DJ activity/);
  const details=renderToStaticMarkup(<ResearchDetailsView data={data} status={status}/>);
  assert.match(details,/Saved facts/);assert.match(details,/Tracks encountered/);assert.match(details,/MusicBrainz curated lists/);
  assert.doesNotMatch(details,/First job|Recently aired/);
});
