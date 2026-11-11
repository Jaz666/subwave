# Silero scan across 109 Sub/Beats tracks — 8 November 2026

For a shorter listening review, see the [initial-onset and last-vocal table](2026-11-08-silero-onset-last-table.md).

## Result

Scanned the existing vocal-stem cue coverage for all **109 prepared tracks**: **216 coverage regions** (108 incoming/head and 108 outgoing/exit). No source tracks were separated again, and no queue, Library, or stem-cache data was changed. There were no scan errors.

At threshold **0.5**, **164 regions across 96 tracks** had a material difference from their saved stem-energy ranges under the rule below. The remaining **52 regions** had no flagged difference. Of the flagged regions, **36 had energy detections but no Silero spans**; Silero never found a span where the saved energy ranges were empty.

This is a difference inventory for listening, not an accuracy score. Silero is speech VAD and can miss singing, sustained/wordless vocals, or vocals that Demucs placed outside the vocal stem. The count of differences therefore does not mean the existing ranges are wrong.

### Difference rule

Flag a region when the first onset or last offset differs by at least **0.75 seconds**, when a saved energy passage of at least **1 second** has little or no Silero overlap, or when a Silero passage of at least **0.75 seconds** falls outside the saved energy ranges. Silero timestamps below are grouped at 32 ms resolution; displayed values are rounded to 0.1s. The attached JSON has unrounded timestamps and all spans for every flagged region.

## Differences only

| Track | Role | Existing stem-energy ranges (source seconds) | Silero ranges (source seconds) | Difference flags |
| --- | --- | --- | --- | --- |
| Hot Natured — Benediction (radio edit) | incoming | 18.1–20.7; 22.6–25.2; 26.4–28.9; 31.1–33.6; 34.3–37.6; 38.4–41.2; 42.6–45.8; 46.9–50.2 | 23.6–24.6; 31.4–32.8; 33.1–33.3; 34.5–36.9; 39.9–40.4; 43.2–45.5; 48.0–48.4; 49.1–49.6 | first-onset, energy-only-span |
| Hot Natured — Benediction (radio edit) | outgoing | 164.1–189.0 | 174.3–175.4; 180.2–182.0; 182.3–183.7; 184.1–185.6; 187.4–187.7 | first-onset, last-offset |
| Sasha — Xpander (edit) | incoming | 15.9–20.9; 22.8–30.1; 32.5–33.4; 33.5–34.4; 41.9–45.6; 46.6–48.4 | 17.4–18.2; 18.7–20.0; 25.4–26.0; 27.2–27.6 | first-onset, last-offset, energy-only-span |
| Sasha — Xpander (edit) | outgoing | 167.5–168.3; 171.3–172.0; 174.0–174.8; 175.0–175.8; 181.5–182.3; 190.0–193.6; 193.7–194.6 | — | detection-presence, energy-only-span |
| Gusto — Disco’s Revenge (Mole Hole radio edit) | incoming | 38.1–39.8; 41.8–45.2; 45.5–47.9 | 42.1–44.8; 45.8–47.9 | first-onset, energy-only-span |
| Gusto — Disco’s Revenge (Mole Hole radio edit) | outgoing | 206.7–208.3; 211.2–212.2; 214.2–216.0; 218.1–219.6; 220.0–221.2 | 203.3–203.8; 207.1–208.1; 214.6–215.8; 218.4–219.5 | first-onset, last-offset, energy-only-span |
| Ninetoes — Finder (radio edit) | incoming | 48.3–50.0 | — | detection-presence, energy-only-span |
| Ninetoes — Finder (radio edit) | outgoing | 157.8–160.0; 160.1–164.0; 164.0–197.7 | — | detection-presence, energy-only-span |
| Storm Queen — Look Right Through (MK vocal edit) | outgoing | 112.6–130.2; 130.3–145.8 | 112.6–113.0; 113.3–114.1; 114.3–114.6; 115.3–115.7; … (10 more) …; 141.3–142.1; 142.4–145.0 | last-offset |
| Maceo Plex — When the Lights Are Out (garage mix) | outgoing | 405.0–406.1 | — | detection-presence, energy-only-span |
| David Morales presents The Face feat. Juliet Roberts — Needin’ U (I Needed U) (Original Mistake radio edit) | incoming | 0.4–16.0; 17.9–19.9; 20.5–23.6; 23.9–27.7; 27.9–32.6; 32.7–47.3 | — | detection-presence, energy-only-span |
| David Morales presents The Face feat. Juliet Roberts — Needin’ U (I Needed U) (Original Mistake radio edit) | outgoing | 162.9–175.8; 176.7–197.5 | — | detection-presence, energy-only-span |
| The MD X‐Spress — God Made Me Phunky | incoming | 13.5–14.3; 14.5–15.8; 21.9–24.1; 30.9–33.0; … (3 more) …; 43.1–44.2; 46.0–48.4 | 13.7–14.1; 14.7–15.5; 23.5–23.9; 31.1–32.8; 34.0–34.7; 37.1–38.5; 39.0–40.2; 46.7–48.4 | energy-only-span |
| Fatboy Slim — Praise You (radio edit) | incoming | 0.1–4.1; 4.1–38.0; 51.5–60.4; 77.6–78.7 | 0.3–4.1; 4.5–8.5; 8.7–12.9; 13.3–20.5; … (6 more) …; 31.9–33.4; 78.1–78.7 | energy-only-span |
| Fatboy Slim — Praise You (radio edit) | outgoing | 180.6–183.2; 185.0–187.6; 189.3–192.0; 193.7–196.5; 197.6–200.8; 202.4–204.7; 206.4–209.3; 210.1–219.8 | 185.8–186.9; 194.7–195.7; 213.5–214.2; 214.4–214.7 | first-onset, last-offset, energy-only-span |
| CJ Bolland — Sugar Is Sweeter (Armand’s Drum ’n’ Bass mix) | outgoing | 257.5–260.1; 260.1–270.2; 270.2–280.2; 280.5–292.2; 294.1–302.2 | 261.3–262.8; 262.9–264.1 | first-onset, last-offset, energy-only-span |
| Gorgon City feat. MNEK — Ready for Your Love | outgoing | 158.6–166.8; 167.8–193.7 | 164.6–165.5; 168.6–168.9; 172.6–173.5; 178.5–179.3; 180.5–181.5; 188.8–189.1 | first-onset, last-offset, energy-only-span |
| Roger Sanchez — Another Chance (radio edit) | incoming | 14.9–21.9; 22.6–36.8; 37.2–44.0; 45.8–54.4; 55.5–65.7 | 15.3–17.0; 17.5–18.1; 18.2–18.9; 23.4–23.8; … (6 more) …; 38.8–39.2; 41.6–41.9 | last-offset, energy-only-span |
| Roger Sanchez — Another Chance (radio edit) | outgoing | 170.3–183.7; 184.8–198.0 | 171.1–173.3; 173.5–173.7; 174.4–175.0; 175.9–176.4; 178.5–178.9; 180.2–180.6; 180.9–181.8; 187.0–187.5 | first-onset, last-offset, energy-only-span |
| Route 94 feat. Jess Glynne — My Love | incoming | 0.2–71.5; 72.7–77.8 | 0.8–2.8; 4.2–6.5; 6.7–9.3; 10.0–10.9; … (11 more) …; 67.2–68.1; 74.9–75.4 | last-offset, energy-only-span |
| Mr. Oizo — Flat Beat (radio edit) | incoming | 0.1–6.2 | 1.8–3.2; 3.5–5.0 | first-onset, last-offset |
| Nightcrawlers — Push the Feeling On (MK Dub Revisited edit) | outgoing | 204.0–211.5; 218.4–219.2; 220.3–221.1; 222.3–223.1; 224.2–225.1; 226.1–239.5 | 204.3–205.0; 205.7–209.4; 209.6–211.2; 226.8–228.9; 229.1–232.8; 233.0–234.8; 234.9–236.3; 236.9–238.3 | last-offset |
| Peggy Gou — Starry Night (edit) | incoming | 25.0–32.9; 32.9–47.9 | 25.7–27.8; 29.1–31.4; 33.9–34.8; 37.2–39.0; 40.8–42.5; 45.6–46.8 | last-offset |
| Peggy Gou — Starry Night (edit) | outgoing | 195.2–204.5 | — | detection-presence, energy-only-span |
| Disclosure & AlunaGeorge — White Noise (radio edit) | outgoing | 240.4–258.2; 262.5–265.7; 270.5–273.7 | 240.7–241.9; 242.5–244.0; 244.7–245.9; 246.7–248.3; 249.1–250.3; 250.6–256.2 | last-offset, energy-only-span |
| N‐Joi — Anthem | incoming | 0.0–12.1; 12.3–17.8; 21.4–24.2; 29.0–38.0; 38.3–45.6; 45.7–48.3 | 6.4–6.8; 14.0–15.4; 15.5–16.0; 29.4–30.6; 30.8–31.2; 47.0–47.4 | first-onset, last-offset, energy-only-span |
| N‐Joi — Anthem | outgoing | 150.9–189.0 | — | detection-presence, energy-only-span |
| Junior Jack — Stupidisco (radio edit) | incoming | 31.9–33.4; 33.8–35.4; 35.8–37.2; 37.6–39.4; … (3 more) …; 45.3–47.1; 47.2–48.1 | — | detection-presence, energy-only-span |
| Junior Jack — Stupidisco (radio edit) | outgoing | 261.2–269.4; 269.6–277.6; 277.6–279.4; 279.6–287.1; … (3 more) …; 296.8–298.6; 298.8–300.9 | 262.1–263.6; 263.9–265.0; 266.0–267.4; 267.6–269.1; … (3 more) …; 275.3–276.9; 277.9–278.8 | first-onset, last-offset, energy-only-span |
| Groove Armada — Superstylin’ (G.A. 7" remix) | incoming | 30.8–36.4; 38.2–40.0; 44.9–78.0 | 31.8–34.4; 45.8–49.0; 49.3–52.6; 52.9–56.3; 56.6–71.1; 71.7–78.0 | first-onset, energy-only-span |
| Groove Armada — Superstylin’ (G.A. 7" remix) | outgoing | 341.2–347.3 | — | detection-presence, energy-only-span |
| Steve Angello & Laidback Luke feat. Robin S — Show Me Love | incoming | 0.3–7.8; 9.1–28.9; 36.5–42.2; 43.2–47.3 | 14.5–16.0; 18.6–19.2 | first-onset, last-offset, energy-only-span |
| Steve Angello & Laidback Luke feat. Robin S — Show Me Love | outgoing | 152.2–158.4; 159.3–170.1; 170.5–174.0; 174.1–181.5 | 154.3–155.0; 155.2–156.1; 171.5–171.7 | first-onset, last-offset, energy-only-span |
| Faithless — Insomnia (radio edit) | outgoing | 181.6–187.4; 189.1–196.9; 197.6–202.5 | 182.8–186.1; 198.1–201.0 | first-onset, last-offset, energy-only-span |
| Lonyo — Summer of Love (radio edit) | incoming | 3.3–4.9; 6.5–8.5; 10.5–11.9; 13.9–15.7; … (7 more) …; 43.3–46.0; 47.0–48.5 | 7.3–8.1; 10.7–11.6; 14.4–15.4; 17.8–19.0; 22.4–22.9; 35.5–35.7; 47.9–48.5 | first-onset, energy-only-span |
| FELIX — Don’t You Want Me (Hooj mix edit) | incoming | 15.2–21.3; 22.2–28.8; 30.2–35.3; 37.7–42.2; 43.6–47.3 | 15.7–18.7; 23.3–26.1; 30.8–34.0; 38.3–41.2 | last-offset, energy-only-span |
| FELIX — Don’t You Want Me (Hooj mix edit) | outgoing | 150.5–183.2 | 150.5–153.8; 154.2–157.7; 158.0–161.3; 161.7–164.9; 165.6–168.6; 171.0–172.3; 173.3–173.6 | last-offset |
| Wankelmut & Emma Louise — My Head Is a Jungle (MK remix) (radio edit) | incoming | 0.0–18.6; 19.1–22.3; 22.8–26.4; 26.7–28.2; … (4 more) …; 42.1–43.6; 46.8–48.8 | 8.4–15.1; 15.5–16.8; 17.2–18.4; 19.3–20.6; … (9 more) …; 42.4–43.4; 48.2–48.7 | first-onset, energy-only-span |
| Wankelmut & Emma Louise — My Head Is a Jungle (MK remix) (radio edit) | outgoing | 170.8–202.0 | 188.3–188.9; 199.9–200.6 | first-onset, last-offset |
| Sandy B — Make the World Go Around (Deep Dish radio edit) | outgoing | 189.1–197.0 | — | detection-presence, energy-only-span |
| Tensnake — Coma Cat (radio edit) | incoming | 0.0–5.5; 35.4–41.9; 43.9–49.9 | 36.3–36.8; 37.1–37.7; 39.9–40.4; 44.6–44.9; 45.1–45.7; 47.6–48.5 | first-onset, last-offset, energy-only-span |
| Tensnake — Coma Cat (radio edit) | outgoing | 139.1–141.1; 148.9–154.7; 156.9–162.8; 165.0–175.0 | 149.2–151.4; 152.0–153.8; 157.5–157.9; 158.0–159.4; 160.9–161.4; 166.1–166.8; 167.1–167.3; 168.3–169.5 | first-onset, last-offset, energy-only-span |
| De’Lacy — Hideaway (Deep Dish radio edit) | incoming | 16.8–20.6; 20.8–24.4; 24.7–28.3; 28.4–40.2; 40.4–44.2; 44.3–50.0 | 21.5–21.9; 22.6–23.2; 26.9–27.5; 29.2–29.6; … (4 more) …; 46.1–47.5; 47.7–48.7 | first-onset, last-offset, energy-only-span |
| De’Lacy — Hideaway (Deep Dish radio edit) | outgoing | 176.5–202.5 | 176.7–178.4; 178.7–180.2; 180.7–184.2; 185.9–186.2; … (3 more) …; 192.6–194.1; 194.3–196.0 | last-offset |
| Shakedown — At Night (original edit) | incoming | 23.2–25.8; 26.5–29.6; 30.8–32.9; 34.3–36.2; 40.0–48.3 | 24.5–25.0; 28.6–29.0; 31.0–31.3; 40.7–41.2; 41.4–42.5; 44.9–45.7; 45.9–46.1 | first-onset, last-offset, energy-only-span |
| CamelPhat & Elderbrook — Cola (radio edit) | incoming | 1.6–10.8; 11.9–14.0; 15.8–17.9; 19.9–21.8; … (3 more) …; 35.3–37.5; 39.5–56.7 | 8.3–10.0; 12.2–13.8; 16.1–17.7; 20.1–21.6; … (5 more) …; 41.6–47.0; 47.3–56.7 | first-onset |
| CamelPhat & Elderbrook — Cola (radio edit) | outgoing | 188.9–213.5 | 189.3–190.8; 191.1–192.8; 193.1–196.8; 197.1–198.6; 198.9–212.6 | last-offset |
| The Chemical Brothers — Hey Boy Hey Girl | incoming | 4.6–5.8; 6.2–13.8; 13.8–43.0; 63.8–66.4 | 4.8–5.6; 6.8–7.6; 8.3–9.6; 10.3–10.8; … (16 more) …; 40.6–41.6; 65.6–66.1 | energy-only-span |
| The Chemical Brothers — Hey Boy Hey Girl | outgoing | 244.5–245.8; 259.6–260.9 | 244.7–245.1 | last-offset, energy-only-span |
| The Supermen Lovers feat. Mani Hoffman — Starlight | incoming | 42.5–49.4 | 43.7–46.5; 46.7–48.1; 48.6–49.5 | first-onset |
| The Supermen Lovers feat. Mani Hoffman — Starlight | outgoing | 197.8–228.8 | — | detection-presence, energy-only-span |
| Hardrive — Deep Inside (edit) | incoming | 0.3–49.4 | 0.8–1.2; 1.4–3.2; 3.4–3.7; 3.9–11.4; … (11 more) …; 36.9–37.2; 38.1–38.5 | last-offset |
| Hardrive — Deep Inside (edit) | outgoing | 358.2–389.6 | — | detection-presence, energy-only-span |
| Armand van Helden — My My My | incoming | 34.8–47.6 | 36.2–38.2; 40.1–40.6 | first-onset, last-offset |
| Bicep — Glue | outgoing | 223.2–229.9; 232.2–241.2 | — | detection-presence, energy-only-span |
| The Shapeshifters — Lola's Theme | incoming | 17.1–21.9; 22.9–25.9; 25.9–30.6; 30.6–48.4 | 23.3–24.7; 27.0–29.9; 31.0–33.2; 34.1–37.3; 38.3–44.0; 44.6–48.4 | first-onset, energy-only-span |
| The Shapeshifters — Lola's Theme | outgoing | 170.4–172.5; 172.8–176.1; 177.1–193.4; 194.3–202.3 | — | detection-presence, energy-only-span |
| Justice — D.A.N.C.E. (radio edit) | incoming | 0.8–45.2; 45.5–49.5; 51.6–52.2 | 5.3–5.9; 7.1–7.4; 7.8–9.2; 10.3–12.9; … (8 more) …; 47.7–48.6; 48.9–49.2 | first-onset, last-offset |
| Justice — D.A.N.C.E. (radio edit) | outgoing | 170.9–176.9; 181.4–185.4 | 172.9–176.3 | first-onset, last-offset, energy-only-span |
| Riton feat. Kah‐Lo — Rinse & Repeat (radio edit) | incoming | 0.4–4.3; 4.3–8.2; 8.2–10.1; 10.2–14.1; … (33 more) …; 122.3–124.2; 124.3–125.5 | 0.6–2.0; 2.6–3.9; 4.6–6.0; 6.6–7.8; … (53 more) …; 122.6–124.0; 124.6–125.6 | energy-only-span |
| Michael Gray — The Weekend (radio edit) | incoming | 7.0–15.9; 16.8–18.4; 18.6–26.0; 26.2–48.8 | 10.6–12.1; 12.3–12.8; 17.6–18.2; 19.1–21.5; … (9 more) …; 46.2–46.5; 48.4–48.8 | first-onset |
| Michael Gray — The Weekend (radio edit) | outgoing | 160.0–189.6 | 160.4–162.6; 163.2–163.6; 169.3–169.9; 170.3–170.8; … (6 more) …; 182.3–182.7; 184.5–186.7 | last-offset |
| Mighty Dub Katz — Magic Carpet Ride 07’ (radio edit) | incoming | 0.8–2.6; 3.0–4.2; 4.5–6.4; 8.2–10.5; 12.0–15.4; 15.7–24.2; 36.2–41.7 | 13.3–13.5 | first-onset, last-offset, energy-only-span |
| Mighty Dub Katz — Magic Carpet Ride 07’ (radio edit) | outgoing | 165.1–172.9 | — | detection-presence, energy-only-span |
| Chris Malinchak — So Good to Me (radio edit) | incoming | 2.1–16.6; 31.4–34.7; 35.4–42.7; 43.3–46.9; 47.4–49.1 | 31.6–34.0; 36.7–37.0; 39.6–41.7; 43.7–44.1; 44.5–45.4 | first-onset, last-offset, energy-only-span |
| Chris Malinchak — So Good to Me (radio edit) | outgoing | 125.0–158.1 | 140.6–140.8; 147.1–147.8; 151.8–152.4 | first-onset, last-offset |
| M&S presents… The Girl Next Door — Salsoul Nugget (If U Wanna) | incoming | 8.4–19.1; 19.9–28.2; 36.1–47.4 | 39.0–39.7; 39.8–41.7; 41.9–43.4; 44.0–47.4 | first-onset, energy-only-span |
| M&S presents… The Girl Next Door — Salsoul Nugget (If U Wanna) | outgoing | 175.3–203.8 | 175.9–176.8; 177.0–177.2; 191.9–192.7; 193.6–197.0; 197.3–199.9 | last-offset |
| Fish Go Deep feat. Tracey K — The Cure & The Cause (radio edit) | incoming | 16.9–28.6; 28.8–32.5; 33.4–37.0; 37.2–43.1; 47.0–48.6 | 17.2–18.6; 18.8–20.5; 22.5–23.5; 24.5–24.8; … (4 more) …; 41.5–42.5; 48.1–48.3 | energy-only-span |
| Fish Go Deep feat. Tracey K — The Cure & The Cause (radio edit) | outgoing | 122.0–133.8; 135.0–137.2; 142.6–144.9; 149.9–153.2 | 124.8–125.8; 128.9–129.4; 130.0–130.3; 132.2–133.2 | first-onset, last-offset, energy-only-span |
| KH — Only Human (radio edit) | incoming | 14.1–47.6 | 19.3–22.8; 22.9–32.4; 32.6–38.7; 39.0–41.8; 41.9–45.3; 45.7–47.6 | first-onset |
| Solardo x Eli Brown — XTC (radio edit) | incoming | 0.0–45.7; 52.3–62.4 | 15.8–17.3; 17.6–18.8; 19.6–20.7; 21.1–22.8; … (10 more) …; 37.4–38.0; 40.7–41.1 | first-onset, last-offset, energy-only-span |
| Solardo x Eli Brown — XTC (radio edit) | outgoing | 121.5–154.2 | 121.9–122.3; 123.1–123.9; 130.6–131.4; 138.2–139.0; 145.7–146.4 | last-offset |
| MK — 17 | incoming | 1.9–60.7 | — | detection-presence, energy-only-span |
| MK — 17 | outgoing | 157.5–194.0 | 158.4–159.3; 159.5–160.2; 160.9–161.2; 161.5–161.9; 167.0–167.7 | first-onset, last-offset |
| Paul Woolford & Diplo feat. Kareen Lomax — Looking for Me | incoming | 0.8–4.7; 4.8–47.1; 48.1–62.7; 64.2–65.0 | 7.0–7.3; 36.3–36.7; 38.2–38.5; 43.7–44.7; … (5 more) …; 60.8–61.2; 61.7–62.3 | first-onset, last-offset, energy-only-span |
| Paul Woolford & Diplo feat. Kareen Lomax — Looking for Me | outgoing | 172.6–201.5 | 172.6–173.2 | last-offset, energy-only-span |
| Rozalla — Everybody’s Free (To Feel Good) | incoming | 6.7–27.1; 28.1–28.9; 44.4–50.4; 51.8–60.4 | 6.9–8.4; 14.3–15.8; 21.7–22.0; 45.7–49.2; 52.3–52.9; 53.0–53.4; 53.8–54.0 | last-offset |
| Rozalla — Everybody’s Free (To Feel Good) | outgoing | 170.4–205.0 | 184.1–184.5 | first-onset, last-offset, energy-only-span |
| Undercover — Never Let Her Slip Away | outgoing | 166.0–204.0 | 168.5–181.1; 184.3–185.0; 186.0–189.4; 189.7–201.2; 201.6–202.0; 202.3–203.1; 203.2–205.1; 205.5–205.9 | first-onset, last-offset |
| Urban Cookie Collective — The Key, the Secret | incoming | 7.5–23.4; 32.4–34.7; 34.9–47.1 | 8.1–8.9; 9.7–11.3; 11.6–12.3; 12.7–14.4; 15.8–16.5; 17.2–18.8; 18.9–21.9 | last-offset, energy-only-span |
| Urban Cookie Collective — The Key, the Secret | outgoing | 185.0–215.9 | 195.0–195.3 | first-onset, last-offset, energy-only-span |
| Agnelli & Nelson — Everyday | incoming | 0.0–19.3; 21.1–33.5; 35.3–45.9 | 8.4–9.2; 14.8–18.3; 18.6–19.0; 21.9–22.2; … (5 more) …; 35.8–38.5; 42.4–42.7 | first-onset, last-offset |
| Agnelli & Nelson — Everyday | outgoing | 185.0–190.5; 191.1–196.7; 198.8–203.1; 205.0–208.2; 209.5–211.9; 212.9–219.0 | 194.2–195.5 | first-onset, last-offset, energy-only-span |
| Blood — Just Say It (Mj Cole MIX) | incoming | 20.7–22.4; 27.9–29.9; 30.2–33.0; 35.5–37.2; … (12 more) …; 100.0–102.1; 103.9–106.8 | 68.9–69.6 | first-onset, last-offset, energy-only-span |
| Urban Cookie Collective — Feels Like Heaven | incoming | 7.0–9.3; 9.4–11.0; 11.2–14.5; 14.9–16.3; 19.4–21.9; 29.2–47.2 | 30.5–33.8; 34.0–35.2; 35.7–36.9; 37.3–41.1; 41.4–42.6; 43.3–44.1; 45.6–46.7 | first-onset, energy-only-span |
| Urban Cookie Collective — Feels Like Heaven | outgoing | 170.3–206.8 | 170.3–174.2; 174.8–175.1; 176.6–177.2; 177.8–181.6; … (9 more) …; 200.0–201.3; 201.7–203.1 | last-offset |
| The Future Sound of London — Papua New Guinea | incoming | 7.6–11.6; 12.2–18.8; 21.3–48.2 | — | detection-presence, energy-only-span |
| The Future Sound of London — Papua New Guinea | outgoing | 191.4–193.0; 193.1–196.1; 196.9–211.8; 213.0–216.8 | — | detection-presence, energy-only-span |
| Airscape — Pacific Melody | incoming | 1.7–3.0; 6.8–8.8; 17.6–19.1; 24.2–29.8; … (4 more) …; 59.1–67.4; 71.3–81.5 | — | detection-presence, energy-only-span |
| Airscape — Pacific Melody | outgoing | 418.5–424.4; 425.2–430.1; 432.1–438.9 | — | detection-presence, energy-only-span |
| Phats & Small — Feel Good | outgoing | 185.7–203.1 | — | detection-presence, energy-only-span |
| Pianoman — Blurred (Pianoman club MIX) | outgoing | 280.9–305.0 | 281.2–303.3 | last-offset |
| Serious — Danger Deeper | incoming | 0.0–7.8; 8.0–29.8; 43.0–46.0 | 8.2–9.6; 9.8–11.4; 12.2–13.0; 17.6–19.3; … (3 more) …; 24.7–27.5; 28.3–28.8 | first-onset, last-offset, energy-only-span |
| Serious — Danger Deeper | outgoing | 202.6–206.6; 207.2–209.3; 222.2–229.6 | — | detection-presence, energy-only-span |
| Altern 8 — Activ 8 (Come with Me) | incoming | 0.1–31.1; 42.4–44.5 | 0.4–2.6 | last-offset, energy-only-span |
| Altern 8 — Activ 8 (Come with Me) | outgoing | 325.4–331.6 | 325.7–326.7; 326.9–328.3 | last-offset |
| Armand van Helden — The Funk Phenomena | incoming | 30.1–47.8 | 30.5–31.5; 32.2–33.6; 34.1–35.3; 36.0–37.4; 37.9–39.0; 39.8–41.0; 41.7–43.1; 43.6–45.2 | last-offset |
| The Beloved — The Sun Rising | outgoing | 264.0–290.8; 291.0–293.5 | — | detection-presence, energy-only-span |
| Gusto — Let’s All Chant | incoming | 7.6–8.8; 9.2–10.8; 11.2–12.6; 12.9–14.5; … (3 more) …; 26.2–27.8; 30.2–45.9 | 33.3–33.7; 34.3–34.7; 35.2–35.7; 37.2–37.4; … (3 more) …; 43.7–44.2; 44.4–45.2 | first-onset, energy-only-span |
| Gusto — Let’s All Chant | outgoing | 180.3–181.7; 181.8–183.3; 183.8–187.0; 187.4–203.6 | 190.8–191.6; 191.7–192.3; 192.6–193.2; 193.6–195.9; 196.4–196.9; 198.2–199.7; 200.1–200.7; 201.8–202.8 | first-onset, last-offset, energy-only-span |
| The Ethics — To the Beat of the Drum (La Luna) | incoming | 0.0–22.8; 24.9–26.1; 28.3–29.7; 32.2–33.2; 35.1–36.9; 42.2–43.8 | 0.1–0.4; 1.1–1.5; 7.6–19.6; 20.1–21.8 | last-offset, energy-only-span |
| The Ethics — To the Beat of the Drum (La Luna) | outgoing | 179.7–185.1; 185.2–193.9; 198.5–203.0 | 180.1–180.3; 180.7–181.5; 181.8–183.2; 183.5–184.9; … (7 more) …; 198.9–199.9; 201.4–202.2 | last-offset |
| U*S*A *Sexual — Open Your Mind | outgoing | 183.7–184.3; 184.8–186.1; 214.1–215.7 | — | detection-presence, energy-only-span |
| Rage — House of the Rising Sun (7" edit) | incoming | 3.4–45.5; 46.2–48.7 | — | detection-presence, energy-only-span |
| Rage — House of the Rising Sun (7" edit) | outgoing | 179.8–213.2 | 180.2–181.8; 182.3–183.0; 184.2–185.4; 193.9–194.3; 195.9–196.7; 196.9–197.3; 200.2–200.8; 203.9–204.9 | last-offset |
| Rage — Run to You | incoming | 23.2–29.9; 30.4–45.2; 45.2–47.6 | 39.2–40.9; 41.2–42.8; 46.7–47.6 | first-onset, energy-only-span |
| Rage — Run to You | outgoing | 181.3–215.9 | 182.2–182.9; 185.3–187.7; 187.9–188.2; 195.1–196.2; 196.4–199.6 | first-onset, last-offset |
| Strike — Inspiration (Guest List radio MIX) | incoming | 5.6–21.7; 35.5–46.0 | 7.0–8.0; 9.0–10.7; 15.6–15.9; 43.5–43.8; 44.2–46.0 | first-onset |
| Strike — Inspiration (Guest List radio MIX) | outgoing | 228.0–260.9 | 237.9–238.3; 243.5–243.7 | first-onset, last-offset, energy-only-span |
| Agnelli & Nelson — El Nino | incoming | 0.2–3.2; 5.0–19.6; 20.4–24.3; 26.7–34.2 | 1.0–1.3; 22.3–23.4; 28.1–28.4 | last-offset, energy-only-span |
| Agnelli & Nelson — El Nino | outgoing | 192.2–222.9 | 194.6–195.8; 198.3–199.5; 199.8–201.5; 203.0–206.9; … (3 more) …; 215.3–215.6; 216.0–216.3 | first-onset, last-offset |
| Freestylers — B Boy Stance (radio edit) | incoming | 0.9–36.5; 37.4–58.5; 60.1–63.2 | 2.2–8.2; 10.8–12.3; 12.4–14.6; 14.7–16.8; … (11 more) …; 56.6–56.9; 57.5–58.1 | first-onset, last-offset, energy-only-span |
| Freestylers — B Boy Stance (radio edit) | outgoing | 216.6–257.4 | 219.3–237.9; 243.1–243.4; 243.5–245.0; 245.3–245.6; 245.8–247.1; 247.7–247.9; 249.1–249.3; 252.5–252.7 | first-onset, last-offset |
| Sash! — Encore une fois (Future Breeze edit) | incoming | 0.2–4.2; 10.9–12.5; 18.2–19.9; 36.3–48.0 | 0.4–3.7; 11.2–12.1; 18.7–19.3; 36.6–39.8 | last-offset |
| Sash! — Encore une fois (Future Breeze edit) | outgoing | 170.6–199.5; 199.8–210.1; 210.4–214.3 | 183.6–184.5 | first-onset, last-offset, energy-only-span |
| Sash! — Ecuador | incoming | 0.6–14.6; 16.3–21.3; 27.2–31.5; 32.9–36.4 | 3.5–5.3; 9.0–9.2; 9.4–9.8; 10.0–10.7; 11.7–12.4 | first-onset, last-offset, energy-only-span |
| Sash! — Ecuador | outgoing | 179.8–182.0; 184.8–187.9; 193.4–196.4 | 185.6–185.9 | first-onset, last-offset, energy-only-span |
| Kadoc — The Nighttrain | incoming | 0.0–3.2; 22.1–24.6; 25.6–28.0; 29.0–40.8 | 1.4–2.3 | first-onset, last-offset, energy-only-span |
| Kadoc — The Nighttrain | outgoing | 166.1–177.7; 179.8–181.0; 181.7–184.4; 185.1–186.0; 186.8–187.8; 189.7–193.5 | 167.7–168.7; 169.9–170.4; 171.1–172.1; 173.3–173.9; 176.2–177.2; 180.2–180.7; 183.6–184.0; 192.3–192.7 | first-onset, last-offset, energy-only-span |
| De’Lacy — Hideaway | incoming | 16.8–20.5; 20.7–24.4; 24.6–28.3; 28.4–40.1; 40.4–44.1; 44.3–50.0 | 21.3–21.8; 22.0–23.5; 25.2–25.7; 26.9–27.6; … (5 more) …; 46.1–47.2; 47.7–48.6 | first-onset, last-offset, energy-only-span |
| De’Lacy — Hideaway | outgoing | 176.5–202.5 | 176.7–178.3; 178.7–180.2; 180.6–184.2; 186.4–187.6; 188.5–189.6; 190.7–192.2; 192.6–194.1; 194.8–195.9 | last-offset |
| Freestylers — Ruffneck | incoming | 0.0–12.5; 16.2–55.5 | 0.8–3.0; 3.6–8.4; 8.8–10.0; 24.8–27.3; … (6 more) …; 44.5–45.4; 45.7–55.1 | first-onset |
| Freestylers — Ruffneck | outgoing | 211.6–238.4 | 211.7–214.1; 214.7–218.1; 219.5–223.2; 224.6–225.6; … (6 more) …; 233.6–234.0; 235.3–235.6 | last-offset |
| Altern 8 — E Vapor 8 | incoming | 0.0–5.4; 12.1–21.8; 34.4–36.8; 36.8–37.7; 41.9–52.0 | 0.4–4.2; 51.7–52.0 | energy-only-span |
| Altern 8 — E Vapor 8 | outgoing | 315.8–319.0 | 316.2–316.9 | last-offset, energy-only-span |
| De’Lacy — Hideaway | incoming | 16.9–20.5; 20.8–24.4; 24.6–28.3; 28.4–40.2; 40.4–44.1; 44.3–50.0 | 21.5–21.9; 22.6–23.0; 25.3–25.7; 26.8–27.6; … (4 more) …; 45.7–47.4; 47.7–48.5 | first-onset, last-offset, energy-only-span |
| De’Lacy — Hideaway | outgoing | 176.4–202.5 | 176.7–178.4; 178.8–180.3; 180.7–182.4; 182.8–183.7; … (3 more) …; 192.6–194.1; 194.6–195.9 | last-offset |
| Ruffneck — Everybody Be Somebody (radio edit) | incoming | 0.0–1.8; 1.8–3.7; 3.8–5.6; 5.7–7.5; … (3 more) …; 13.4–15.2; 22.9–48.4 | 2.4–2.7; 24.8–26.3; 27.1–28.4; 28.6–30.7; … (8 more) …; 46.5–47.6; 48.0–48.4 | first-onset, energy-only-span |
| Ruffneck — Everybody Be Somebody (radio edit) | outgoing | 186.1–218.7 | 186.8–187.0; 187.2–187.4; 187.7–195.0; 195.2–214.3 | last-offset |
| Blue Boy — Remember Me (Sure Is Pure 7" edit) | incoming | 2.3–11.9; 14.0–17.1; 17.2–24.0; 30.5–34.9; 39.1–41.4; 41.9–47.2; 48.6–50.9; 51.4–56.5 | 3.5–4.4; 5.7–6.0; 8.5–9.7; 15.0–16.1; 16.3–17.0; 18.2–20.2; 22.8–23.9 | first-onset, last-offset, energy-only-span |
| Blue Boy — Remember Me (Sure Is Pure 7" edit) | outgoing | 182.6–193.2; 193.9–199.1; 200.6–202.8; 203.0–208.6; 209.6–212.3; 212.9–217.9; 219.6–221.4 | 182.7–183.3; 183.4–184.4; 190.2–190.5 | last-offset, energy-only-span |
| Phats & Small — Tonite | incoming | 18.2–19.8; 20.2–21.8; 23.9–25.1; 25.7–26.8; 29.8–37.1; 37.1–44.5; 44.8–47.3 | 30.2–34.3; 35.0–36.7; 37.6–41.7; 42.2–44.2; 45.4–47.3 | first-onset, energy-only-span |
| Phats & Small — Tonite | outgoing | 193.6–224.0 | 200.8–201.3; 219.7–219.9; 222.8–223.7 | first-onset |
| Shut Up and Dance — Save It Till the Mourning After | outgoing | 176.2–207.1 | 180.1–180.4; 184.3–184.7; 200.3–200.7 | first-onset, last-offset, energy-only-span |
| Urban Hype — A Trip to Trumpton | incoming | 0.0–2.9; 14.9–16.1; 27.4–29.2; 42.7–44.9 | 0.3–1.9; 15.3–15.6; 28.4–28.8; 43.4–45.0 | energy-only-span |
| Urban Hype — A Trip to Trumpton | outgoing | 179.4–179.9; 182.6–183.4; 186.0–186.7; 189.2–190.2; 194.5–196.6; 197.9–200.0; 201.3–209.9 | 195.0–196.3; 198.4–199.8; 201.7–206.1; 207.1–208.6; 208.8–209.6 | first-onset |
| Urban Hype — Living in a Fantasy | incoming | 0.9–2.3; 2.8–4.4; 4.6–9.8; 10.2–11.8; … (4 more) …; 36.8–38.9; 44.3–46.4 | — | detection-presence, energy-only-span |
| Urban Hype — Living in a Fantasy | outgoing | 262.0–264.4; 269.5–271.5; 277.0–280.3; 280.5–287.8; 288.0–289.6; 289.8–294.5 | — | detection-presence, energy-only-span |
| Blue Boy — Sandman (original 7") | outgoing | 190.9–201.0; 201.4–209.1; 209.3–228.3 | 191.0–193.6; 193.8–196.1; 196.4–198.2; 199.0–199.8; … (4 more) …; 220.6–222.3; 222.9–223.2 | last-offset |
| Indo — R U Sleeping (Bump n Flex MIX) | incoming | 30.8–33.5; 34.5–37.3; 38.3–41.1; 42.1–44.9; 45.8–48.8; 49.6–52.7; 53.4–59.4 | 31.2–33.0; 34.9–36.9; 38.7–40.6; 42.5–43.2; … (6 more) …; 53.8–55.8; 56.1–57.7 | last-offset |
| Indo — R U Sleeping (Bump n Flex MIX) | outgoing | 204.0–209.7; 209.8–217.3; 217.3–224.8; 224.9–227.3 | 208.1–208.5; 210.0–210.4; 215.7–216.2; 217.6–217.9 | first-onset, last-offset, energy-only-span |
| Degrees of Motion — Shine On | incoming | 0.8–32.4; 32.5–33.8; 36.2–44.6; 44.6–48.0; 48.1–49.3 | 1.1–1.3; 38.2–38.6; 40.7–41.8; 42.8–43.2; 45.9–47.8; 48.6–49.3 | energy-only-span |
| Degrees of Motion — Shine On | outgoing | 262.3–297.2 | — | detection-presence, energy-only-span |
| Madison Avenue — Don’t Call Me Baby | incoming | 31.4–49.7 | 32.2–32.5; 33.1–33.4; 33.8–36.5; 36.9–49.7 | first-onset |
| Madison Avenue — Don’t Call Me Baby | outgoing | 193.7–198.2; 198.6–202.0; 202.4–217.3; 217.8–225.5 | 193.7–194.2; 194.9–196.2; 197.2–197.9; 200.8–201.1; … (4 more) …; 221.7–223.3; 223.4–223.8 | last-offset, energy-only-span |
| Shut Up and Dance — I Love U | incoming | 1.8–7.4; 8.2–20.2; 21.9–27.0; 27.8–32.9; 33.2–38.4; 38.6–45.3 | 0.6–1.3; 2.0–3.9; 4.2–6.0; 6.2–6.5; … (11 more) …; 38.9–40.2; 41.9–45.3 | first-onset, energy-only-span |
| Shut Up and Dance — I Love U | outgoing | 193.7–198.7; 200.6–205.6; 206.5–209.5; 211.5–216.3 | 194.3–195.4; 195.7–196.9; 197.0–197.4; 204.3–205.1; 215.3–216.0 | energy-only-span |
| Fabulous Baker Boys — Oh Boy Rafmat (radio edit) | incoming | 0.6–2.7; 2.8–3.5; 8.1–9.9; 10.2–10.9; … (7 more) …; 67.2–74.2; 74.7–77.8 | 61.9–62.1; 64.0–64.9; 65.1–65.6; 69.1–69.7; … (3 more) …; 72.5–73.0; 76.5–77.6 | first-onset, energy-only-span |
| Fabulous Baker Boys — Oh Boy Rafmat (radio edit) | outgoing | 209.3–210.4; 223.9–241.0 | — | detection-presence, energy-only-span |
| Lovestation — Teardrops | incoming | 0.0–1.8; 1.8–13.4; 16.1–17.6; 19.7–21.6; … (5 more) …; 41.4–47.5; 48.9–49.9 | 11.4–11.8; 12.1–13.2; 30.9–31.3; 35.6–36.2; 37.5–38.8; 44.0–44.3; 44.7–46.5 | first-onset, last-offset, energy-only-span |
| Lovestation — Teardrops | outgoing | 189.4–194.1; 194.3–201.0; 201.5–203.1; 203.4–204.8; 205.1–206.8; 207.0–209.1; 209.2–222.3 | 189.6–189.9; 191.5–191.9; 192.1–193.9; 195.4–195.7; … (4 more) …; 205.7–206.2; 207.6–208.2 | last-offset, energy-only-span |
| Camisra — Let Me Show You | incoming | 2.1–26.8; 28.2–45.6 | 2.6–3.7; 6.2–7.2; 9.7–10.4; 11.4–12.2; 13.2–14.0; 14.3–15.1 | last-offset, energy-only-span |
| Camisra — Let Me Show You | outgoing | 167.3–187.4 | 167.4–167.7; 167.9–168.4; 168.8–169.3; 169.5–176.2 | last-offset |
| DJ Jean — The Launch | incoming | 0.0–3.1; 20.9–25.1; 35.4–37.9; 38.9–41.1; 41.3–45.6 | 0.0–1.7; 21.2–23.7; 35.6–37.4; 39.2–40.4 | last-offset, energy-only-span |
| DJ Jean — The Launch | outgoing | 186.2–189.9 | 186.4–187.8 | last-offset |
| Donna Summer — I Feel Love (Rollo / Sister Bliss Monster mix) | incoming | 23.4–46.5; 53.8–61.9 | — | detection-presence, energy-only-span |
| Donna Summer — I Feel Love (Rollo / Sister Bliss Monster mix) | outgoing | 556.2–578.8; 578.8–580.6; 580.7–584.6 | 558.1–558.9; 559.7–560.8; 561.6–562.7 | first-onset, last-offset, energy-only-span |
| Svenson & Gielen — Beauty of Silence | incoming | 1.0–4.8 | — | detection-presence, energy-only-span |
| Svenson & Gielen — Beauty of Silence | outgoing | 174.0–179.8 | — | detection-presence, energy-only-span |
| Dario G — Sunchyme | outgoing | 203.5–213.6; 213.9–232.7 | — | detection-presence, energy-only-span |
| Dario G — Sunchyme | outgoing | 203.2–213.3; 213.6–232.8 | — | detection-presence, energy-only-span |
| Bel Amour — Bel Amour | incoming | 0.0–48.0 | 23.4–25.6; 26.2–27.3; 27.5–29.3; 30.9–33.1; … (4 more) …; 47.3–47.6; 47.8–48.1 | first-onset |
| Bel Amour — Bel Amour | outgoing | 137.4–174.6 | — | detection-presence, energy-only-span |

## Reproducibility

- Silero VAD v5.1.2 ONNX, SHA-256 `2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f`; threshold 0.5.
- Compared each saved `cueCoverage.incoming`/`outgoing` energy result with Silero run over the matching cached `head-vocals.flac`/`exit-vocals.flac` region.
- Full precision, before/after spans, coverage bounds, flags, and track IDs: [JSON difference data](2026-11-08-silero-109-track-differences.json).
- A track with no cue candidate for a direction has no coverage region for that direction; the scan covers all 216 regions present in the saved 109-track queue.
