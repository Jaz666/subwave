import Link from 'next/link';
import ManualPage from './ManualPage';

export default function ExtendedSleeveNotes() {
  return (
    <ManualPage
      eyebrow="MANUAL · 17"
      title="Extended Sleeve Notes."
      intro="The stories behind the records, gathered as your station plays. Extended Sleeve Notes builds a collection of music knowledge around your library, gives the DJ something interesting to say, and lets you explore the connections yourself."
      current="/manual/sleeve-notes"
    >
      <section className="bs-section">
        <p className="bs-eyebrow">BEHIND THE MUSIC</p>
        <h2>Give the DJ more to talk about.</h2>
        <p>
          SUB/WAVE already knows what is playing and who is at the microphone. Extended
          Sleeve Notes adds context: how an album came together, a turning point in an
          artist&rsquo;s career, who produced a recording, or the older record sampled by
          the track you are hearing. A useful discovery can become a short remark between
          songs or part of a longer conversation between DJs.
        </p>
        <p>
          It is optional. You can run the station without it, or enable it to build a
          collection that grows over time. The same saved knowledge is available to you
          in the admin console, with sources you can inspect.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">SWITCHING IT ON</p>
        <h2>Start with the LLM your station already uses.</h2>
        <ol className="bs-list">
          <li>Sign in to the admin console and open <strong>Settings &rarr; DJ Behaviour</strong>.</li>
          <li>Enable <strong>Extended Sleeve Notes</strong> and save the setting.</li>
          <li>Open <strong>Notes</strong> in the admin navigation. Its Overview shows research activity and saved knowledge.</li>
          <li>In the Notes <strong>Settings</strong> tab, check collection preferences and optionally configure Genius access for credits and musical connections.</li>
          <li>Let the station play. Return later to see what it has learned.</li>
        </ol>
        <p>
          Research uses SUB/WAVE&rsquo;s configured LLM. A paid service is not required:
          a local model can do the work too. For a local model, allow for the additional
          processing load and time needed alongside its ordinary DJ work.
        </p>
        <div className="bs-callout">
          <p className="bs-eyebrow">IF YOU PAY BY THE TOKEN</p>
          <p>
            Allow roughly <strong>2,000 additional tokens per track played</strong> for
            background research. This is an estimate, not a fixed charge or limit:
            source material and research activity vary, and reviews and on-air segments
            add further usage. Check your station&rsquo;s usage and budget controls;
            the <Link href="/manual/llm" className="bs-link">Models &amp; Tokens</Link> guide
            explains the wider trade-offs.
          </p>
        </div>
        <p>
          Switching the master setting off hides the Notes workspace, Dash card and
          manual segment control, and stops new feature activity. Saved knowledge and
          queued jobs are retained for when you enable it again. Audio already committed
          to the broadcast finishes safely.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">BACKGROUND RESEARCH</p>
        <h2>A collection that grows with your library.</h2>
        <p>
          Research starts from music the station encounters and also works through
          unexamined library tracks when there is room. MusicBrainz helps identify
          artists and releases; Wikipedia supplies artist and album background; optional
          Genius research adds recording credits, sample relationships and other music
          context. Coverage depends on what those sources contain and which sources you
          have enabled.
        </p>
        <p>
          Sample connections can lead research beyond the first recording and into
          other known library artists. This is discovery around your existing music:
          it does not download songs or add outside recordings to the playable library.
          Lyrics are not collected or used as Sleeve Notes material.
        </p>
        <p>
          Broadcast work takes priority. Research waits while the station is busy
          choosing tracks, preparing speech or handing work to the broadcast. Provider
          limits, temporary failures and the station&rsquo;s token budget can also make
          it wait. The Overview separates <strong>Controller Research</strong>, which
          collects and connects information, from <strong>LLM Research</strong>, which
          turns source material into usable talking points and handles reviews.
        </p>
        <p>
          Check <strong>Research while the station is empty</strong> in Notes settings
          if you want collection without listeners; other station settings still affect
          when work can run. A newly enabled station may have little to show at first.
          Leave it time to build useful coverage rather than expecting every artist to
          have a story immediately.
        </p>
        <p>
          To stop collecting while keeping saved knowledge available to the DJ, choose
          <strong> Pause collection</strong> in Notes settings. This keeps queued work
          for later. It is different from turning the master switch off, which also
          stops the feature&rsquo;s on-air use and hides its interface.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">THE WORDS IN THE WORKSPACE</p>
        <h2>Saved facts become Story Sparks.</h2>
        <ul className="bs-list">
          <li><strong>Stories</strong> are researched talking points about artists, albums or tracks: an anecdote, a recording detail or a notable achievement.</li>
          <li><strong>Connections</strong> describe musical relationships, such as one recording sampling or covering another.</li>
          <li><strong>Credits</strong> identify contributions such as writing, production or a featured performance.</li>
          <li><strong>A Story Spark</strong> is a saved fact offered to the DJ as something it could mention. The DJ may weave it into its own words or leave it out.</li>
          <li><strong>A source</strong> is the supporting reference behind the material. Follow it when you want to understand or check a claim.</li>
        </ul>
        <p>
          Use the <strong>Stories</strong> tab to browse saved facts, recent additions
          and material associated with your library. Saved does not mean aired, and
          offered does not mean spoken. A source gives you something to check; it does
          not make every interpretation or piece of wording infallible.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">STATION BRAIN</p>
        <h2>Follow the connections yourself.</h2>
        <p>
          Open <strong>Station Brain</strong> in Notes and search for an artist, album
          or track. The <strong>Map</strong> view lets you move through those layers,
          select an item and inspect its saved knowledge and relationships. Fullscreen
          gives a larger graph more room. A known item can have an empty dossier if
          research has not saved any material for it yet.
        </p>
        <p>
          Artist, album and track links in the Overview&rsquo;s On Air and Next Up
          panels take you into the relevant library context. Where queue controls are
          available, you can queue music from your library as an operator action.
          An external discovery is a reference to music or an artist beyond the library,
          not a promise that the station can play it.
        </p>
        <p>
          Switch to <strong>Stats &amp; Discoveries</strong> for a broader view of the
          saved network. <strong>Most connected</strong> highlights external names
          connected to distinct library artists; <strong>Sample sources</strong> and
          <strong> Sample users</strong> explore the two directions of sample relationships.
          These views use saved research. Use Refresh to update the view as the
          collection grows; opening it does not launch a new external search.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">ON THE DASH</p>
        <h2>A little reading while the records play.</h2>
        <p>
          The Dash gains a rotating <strong>Sleeve Notes</strong> card showing saved
          material. Its text reveals gradually; hovering over the card or focusing
          inside it completes the reveal and pauses rotation so you can finish reading.
          The Station Brain header link opens the current on-air library artist.
        </p>
        <p>
          Reading a card does not make the DJ say it, reserve it for a segment or count
          it as used on air. If a saved Spark needs attention, use its review flag.
          Connections and credits do not carry that same card-level flag.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">ON THE MICROPHONE</p>
        <h2>A passing remark, or a conversation.</h2>
        <p>
          In an ordinary spoken link, the DJ can receive a relevant saved Spark and
          turn it into a natural remark. It may leave the Spark out when the timing or
          subject does not fit. The station does not wait for fresh research before it
          can speak: without suitable saved material, the normal link still works.
        </p>
        <p>
          A dedicated <strong>Sleeve Notes segment</strong> gives the material more room.
          When an automatic Banter slot is eligible, Sleeve Notes gets the first chance
          if there is enough suitable material, including during Produced Episodes.
          Ordinary Banter is the fallback. An explicit manual Banter action still
          requests Banter.
        </p>
        <p>
          Use the manual Sleeve Notes segment control on the Dash when you want to
          request one yourself, and check Notes settings for segment controls. A manual
          request still needs suitable saved material and safe broadcast timing; it
          cannot create a researched conversation from an empty collection.
        </p>
        <p>
          Repetition protections space out stories, topics and relationships. A story
          being saved is therefore not a guarantee it will be used next. Recognition
          stories from the same MusicBrainz series also share a six-hour cooldown after
          detected use in confirmed aired speech. Manual segments retain the
          operator&rsquo;s override of aired-story cooldowns.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">HEARD ON AIR</p>
        <h2>See what the DJ actually said.</h2>
        <p>
          Open <strong>Heard on air</strong> in Notes to read confirmed aired exchanges
          and their transcripts. The default Sleeve Notes view includes confirmed
          dedicated segments and ordinary links where Spark use was detected. The
          Overview also shows recent exchanges from that view.
        </p>
        <p>
          A segment reaching the air and a wording detector finding a particular Spark
          are separate things. The DJ can paraphrase a fact in a way the detector misses.
          Use the <strong>Use detected</strong>, <strong>Use not detected</strong> and
          <strong> All aired exchanges</strong> filters to investigate. An ordinary
          greeting that was offered a Spark but did not use it is not automatically a
          Sleeve Notes exchange in the default view.
        </p>
        <p>
          Flag an exchange when its spoken content needs review. This preserves the
          distinction between a problem in a saved fact and a problem in how the DJ
          expressed it. Correcting saved material does not rewrite the historical
          transcript of what aired.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">YOUR EDITORIAL CHOICES</p>
        <h2>Shape the research and the voice.</h2>
        <p>
          Research instructions decide what is worth saving; persona direction and
          house rules shape how the DJ talks about it. In Notes settings, the advanced
          Wikipedia research prompt lets you steer the kinds of facts extracted from
          articles. Its preview tests draft instructions against cached source material
          without saving new facts. Preview and review work can still use LLM tokens.
        </p>
        <p>
          Changing research instructions is not a rewrite of everything already saved.
          Browse existing material in Stories and use the available correction,
          withdrawal and review controls where needed. The <strong>Review</strong> tab
          lets you inspect findings and decide which proposed changes to apply. A flag
          asks for attention; it is not itself a published correction.
        </p>
        <p>
          Keep factual selection and delivery in mind separately. Asking for warmer,
          shorter or less formal speech changes presentation; it does not supply
          evidence for a new claim. Inspect the supporting source when the underlying
          fact is in doubt. See <Link href="/manual/dj" className="bs-link">How the DJ Works</Link>
          {' '}for personas and <Link href="/manual/admin" className="bs-link">Admin &amp; Settings</Link>
          {' '}for the wider station controls.
        </p>
      </section>

      <section className="bs-section">
        <p className="bs-eyebrow">WHEN SOMETHING LOOKS QUIET</p>
        <h2>What to check first.</h2>
        <ul className="bs-list">
          <li><strong>Notes has disappeared.</strong> Check the master switch in Settings &rarr; DJ Behaviour. The workspace is hidden while the feature is off; saved data is retained.</li>
          <li><strong>Research is waiting.</strong> Check Overview for collection pause, budget or activity messages, then check empty-station preferences and source configuration.</li>
          <li><strong>An artist has little material.</strong> Research may not have reached them, a source may have no useful coverage, or the identity may be ambiguous. Try other library items and inspect the saved sources.</li>
          <li><strong>A saved story has not aired.</strong> Relevance, speaking opportunities and cooldowns all affect selection. A Spark can also be offered and left unused.</li>
          <li><strong>A discovery cannot be queued.</strong> It may describe music outside your library. Research does not make that recording playable.</li>
          <li><strong>A segment aired but use was not detected.</strong> Read its transcript. Wording detection is a useful signal, not a complete account of every paraphrase.</li>
        </ul>
        <p>
          Start with the defaults and a few familiar artists. Check the sources, listen
          to how the DJ uses them, and adjust the editorial instructions once you know
          what suits your station. Research coverage and on-air opportunities vary;
          neither a particular discovery nor a particular broadcast is guaranteed.
        </p>
      </section>
    </ManualPage>
  );
}
