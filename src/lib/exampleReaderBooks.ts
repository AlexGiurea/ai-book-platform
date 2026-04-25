import type { Book } from "@/lib/sampleData";

/**
 * Full reader content for library “example” books (not Living at Last — that stays in sampleData).
 */
export const extraExampleBooks: Record<string, Book> = {
  "sample-archive": {
    id: "sample-archive",
    title: "The Last Archive",
    genre: "Science Fiction",
    tone: "Contemplative",
    synopsis:
      "In a world where memories are stored in crystalline archives, a lone archivist discovers that someone has been systematically erasing the past.",
    coverFrom: "#0f172a",
    coverVia: "#1e1b4b",
    coverTo: "#0f172a",
    coverAccent: "#818cf8",
    coverImageUrl: "/sample-covers/last-archive-cover.png",
    wordCount: 1420,
    chapterCount: 5,
    createdAt: "2026-04-20",
    status: "complete",
    chapters: [
      {
        number: 1,
        title: "The Citizen Without a File",
        content:
          "Elias opened the reading hall at dawn, as he had for fourteen years. The archives breathed a faint chill, a smell like rain on glass, and the soft harmonic hum of crystals waking in their rows.\n\nOn most mornings the catalog aligned itself overnight: names, years, the ordinary lattice of a civilization that preferred its memories documented. This morning, one shelf sang a half-tone off-key.\n\nHe stood before it, gloved, and read the label twice. Sera Vale. Born 214. Occupation: ferry pilot. A life reduced to a sentence on a card. The crystal behind it, which should have been warm with stored afternoons, was hollow.\n\nNot cracked. Not stolen. Unwritten, as if Sera had never consented to a single recollection. Elias had seen gaps before — the rare citizen who paid for silence — but the archive kept a void-marker. This was different: the void itself had been edited out. Someone had removed the fact that a gap had ever existed.\n\nHe made a note in his own hand, an analog habit his mentors had teased and then, quietly, praised. The pen scratched with a sound that felt truer than any audit trail.",
      },
      {
        number: 2,
        title: "Glass, and What It Keeps",
        content:
          "The crystals were not mere storage. They were arguments. Each facet caught a different angle of a day: the heat on Sera’s neck as she coaxed an old engine; the way she laughed once at a joke told badly; the precise moment she decided not to return a message. People came to the hall to be witnessed. Elias was not a priest, but he often felt like one.\n\nBy noon the anomaly had a neighbor. Another name: Micah Renn. The same un-writing. A thin cold moved down Elias’s spine, the feeling of a pattern with intent.\n\nHe pulled the city plans from the basement tier, steel drawers sliding like tectonic plates. Ferries, pilots, supply runs — a net of lives that barely touched. Sera and Micah had shared only one public connection: a repair dock on the southern pier, a week before Micah’s crystal went quiet.\n\nElias set the plans aside and went to the dock himself. The wind off the water tasted of rust. A mechanic remembered Sera, remembered Micah, remembered nothing that should have been secret enough to delete.\n\n“Maybe they had the same thought,” the mechanic said, wiping grease on her coveralls. “Two people, one thought — maybe that is what the archive can’t stand.”\n\nElias did not know yet if she was right. He suspected worse: the archive was not losing memories. It was being told to disbelieve them.",
      },
      {
        number: 3,
        title: "The Hour Between Recollections",
        content:
          "Between shifts, the hall ran on a hush the architects called “the kind hour” — a sixty-minute span when backups whispered to backups and the air shimmered, almost beautiful, with redundancy. It was the closest thing the city had to a soul reviewing itself.\n\nElias waited through it with his hand on a dead crystal, willing warmth that would not return. On the far wall, a display tallied consents, revocations, rare court orders. Nothing pointed to Sera or Micah.\n\nA junior archivist, Nara, found him. She looked younger than the city’s new lights made people look.\n\n“I shouldn’t show you this,” she said, and then showed him anyway: a trace not in the public ledger, a maintenance token issued under a name Elias had not heard since training. A custodian with permission to re-index entire bays without public notice. The token had been used three times in the last month — all on ferry pilots’ aisles.\n\n“Who holds that permission?” he asked, though he feared he knew.\n\nNara’s eyes flicked toward the upper floor, the administrative office with its low lamps and its carpet that never quite muffled the sound of important shoes.\n\nElias thought of the word erasure, and of how it always implied a hand.",
      },
      {
        number: 4,
        title: "A Room That Never Indexed",
        content:
          "They went up after closing. The office doors were not locked. That should have been warning enough: whoever wanted him to know could open doors.\n\nThe room at the end of the hall was small. No crystals. A single table with a map of the city not in streets but in memory density — hot cores where people lived in layers, pale zones where the archives barely touched, and, like bruises, several ferry routes traced in a careful hand. A route between two bruises had been penciled, then partially erased, then drawn again, as if a mind had changed.\n\nOn the table lay a tool Elias had only seen in manuals: a lattice cutter, its blade dulled, its calibration wrong for glass. It was meant for plants, for gardens — for living matter that would heal — not for the permanent facets of a life.\n\nThe discovery did not make him feel clever. It made him feel complicit. The hall had been built to protect memory from time. It had never been built to protect memory from the people who tended it.\n\nHe heard footsteps in the hall outside. Nara, breathing fast.\n\n“They know you’re here,” she whispered. “Elias, you have to choose what you can still prove.”\n\nHe took the map, the cutter, and the smallest shard of a crystal that was not empty but not full — a sliver of Sera, perhaps, that someone had been too hurried to expunge. Proof, he hoped, of the shape a life left behind even when the life was told to vanish.",
      },
      {
        number: 5,
        title: "What the Archive Could Not Hold",
        content:
          "In the public square, the city announced a festival of recollection, lanterns hung like tiny archives of light. Elias did not go to celebrate. He went because crowds were a kind of record too — faces, flinch, the story of a city trying to look innocent.\n\nHe found the administrator by the old fountain, the one everyone pretended was ancient though it was only old enough to be comforting. The administrator smiled with the even warmth of a person who had rehearsed compassion.\n\n“You’ve been in my office,” the administrator said. Not a question. “Elias, we remove rot so the rest can be trusted.”\n\n“Rot,” Elias repeated. “Or disagreement.”\n\nThe administrator’s smile thinned. “The ferries were carrying more than goods. You understand what a concentrated memory of dissent could do, unfettered, copied dock to dock.”\n\nElias thought of the map, the bruise-like routes, the hasty hands. “You can’t unmake a life because it scares you,” he said. “You can only unmake the claim that you were ever fair.”\n\nHe would not win that night. Maybe not even that year. But he set the sliver of crystal in the administrator’s gloved palm — a weight almost nothing, and everything — and walked back toward the reading hall, where a few honest citizens would still come at dawn, wanting to be witnessed, and where his pen, for now, could still leave a mark paper would keep.",
      },
    ],
  },
  "sample-cartographer": {
    id: "sample-cartographer",
    title: "The Cartographer's Daughter",
    genre: "Historical Fantasy",
    tone: "Lyrical",
    synopsis:
      "A young woman inherits her father's map-making shop and discovers that his most famous maps lead not to places, but to people who have been lost to history.",
    coverFrom: "#1a0a00",
    coverVia: "#4a1800",
    coverTo: "#1a0a00",
    coverAccent: "#f59e0b",
    coverImageUrl: "/sample-covers/cartographers-daughter-cover.png",
    wordCount: 1680,
    chapterCount: 5,
    createdAt: "2026-04-15",
    status: "complete",
    chapters: [
      {
        number: 1,
        title: "An Inheritance of Ink",
        content:
          "Mira found the key where her father had always joked it would be: inside a book that was not a book, spine hollow, pages glued into a block so the casual eye saw only a novel no one would borrow. The shop smelled of vellum, oil, and old rain, the same weather trapped in paper year after year.\n\nThe bell above the door had not rung in three days, not since the last mourners left. Now it rang for no one, a fault in the wire her father would have mended in a minute, had he been there to do it. Mira left it; she liked the imperfect sound. It was honest.\n\nOn the worktable sat his master map, half finished — coastlines in confident ink, the interior of the country left a pale ghost. Notes crowded the margin in his cramped script: not distances, not elevations. Names, instead, with dates beside them, as if the land were a diary.\n\nShe laid her palm on the vellum, expecting cold. The map warmed, barely, like skin. She told herself it was the sun through the high window, but the sun was behind cloud.\n\n“Show me,” she whispered, and felt silly until the ink shifted — not much, a hair’s breadth — and a river appeared where there had been only blank, a river her father had never drawn because, she would learn, it had not existed until someone needed it to.",
      },
      {
        number: 2,
        title: "The River That Was Not There",
        content:
          "Mira took the map to the town archive, a modest room with a severe keeper who disliked private cartographers on principle. She unrolled the vellum with care, anchoring the corners with glass weights that had once been her mother’s paperweights, heavy as truth.\n\nThe keeper adjusted her spectacles. “That is not the southern trade route,” she said. “It never was.”\n\n“Then where did the ink come from?” Mira asked.\n\nThe keeper’s mouth tightened. “If your father drew fantasy, you should not waste civic time —”\n\n“It isn’t fantasy,” Mira said, though she was not sure what it was. She only knew the river on the map was not a mistake. The mistake would have been fainter, more apologetic. This line was shameless.\n\nShe spent the evening comparing her father’s earlier surveys. The more she looked, the more she saw his famous precision eroding at the edges — not error, not age. A gentle refusal to keep pretending that the official country matched the one people lived in.\n\nIt was a map, she realized, that led you to a person if you needed them badly enough, not to a place. The river was a path between two hearts that the world had not admitted could meet.",
      },
      {
        number: 3,
        title: "A Name the Map Refused",
        content:
          "The name that appeared in the margin at midnight was not in any census. Tressa of Salt Bridge — a woman no parish recorded, a bridge that appeared on no bridge-list. Mira had fallen asleep in the shop chair; she woke to candle smoke and a line of ink crawling like a small creature along the vellum, forming letters until the name was complete.\n\nTressa. The ink smelled like sea.\n\nMira’s father had taught her the ethics of the craft: a map is a promise. You do not promise a road you would not walk. If he had put Tressa on the page, Tressa was somewhere the world had refused to file.\n\nShe closed the shop and followed the new river in the world — a thin stream, hardly more than a suggestion, that locals called “the weeping ditch” and avoided after dark. At its bend, stones formed a low arch. No bridge-list, no toll. A bridge anyway.\n\nOn the far side, a woman knelt, washing a shawl. She looked up, unsurprised.\n\n“You’re his daughter,” Tressa said. “The ink found you, then. Good.”\n\n“I’m looking for —”\n\n“For what was lost to ledgers,” Tressa finished. “So am I. Your father helped me hide. I think he also hoped someone would be brave enough to unhide, when the time came.”\n\nThe map was not a guide to territory. It was a witness protection program drawn in coastline and water.",
      },
      {
        number: 4,
        title: "Where the Compass Turned",
        content:
          "Mira’s compass, an instrument her father had calibrated with theatrical seriousness, did not point north in Tressa’s company. It pointed to questions — a needle trembling between curiosity and fear.\n\n“Maps remember shame,” Tressa said, walking beside the stream. “When a country decides a whole group of people is inconvenient, the shame does not vanish. It soaks into ground. It bends rivers.”\n\nMira thought of the shop, the false book, the hollow key. “My father made rivers where officials drew walls.”\n\n“He gave water to thirst,” Tressa said. “The powerful prefer thirst. Thirst is easier to lead.”\n\nThey came to a crossroads the official maps called empty scrub. On Mira’s master map, the crossroads was a small town, a square, a well. The paper reality arrived first, faint; then, like heat shimmer, the town arrived in the world — a trick of the eye, then stone underfoot, then voices.\n\nPeople nodded to Tressa as if she had been expected that morning, as if she had always been on their corner. A child held up a paper kite shaped like a map, ink still wet.\n\nMira’s hands shook. This was the craft beyond craft — not depiction, but recovery. A cartographer as archaeologist of the erased.\n\n“Can I do this without him?” she asked.\n\nTressa put her hand on Mira’s shoulder. “You are already doing it. The map asked for you.”",
      },
      {
        number: 5,
        title: "The Country That Knew Her",
        content:
          "Word spread the way it always had before newspapers — a bell, a baker, a raised eyebrow. The lost returned to a square that had not existed a week before. Some were old, some were young, all carried stories officials had called rumor until rumor became geography.\n\nMira’s shop did not have space for the crowd, so the town gave her the square itself. She set up a table under the well’s roof and unrolled the master map, now crowded with new ink, the coastlines no longer smug, the interior no longer ghost.\n\nA man approached with a name she knew from a margin: Yann, 1822, a miner whose strike had been struck from the record. The map showed a seam of ore under a hill that the crown had long insisted was barren. Yann wept, not for gold, but for proof.\n\nBy dusk, the mayor arrived — a practical woman who understood that maps could dethrone tax rolls. “You will be licensed,” she said, voice tight, “or you will be jailed.”\n\nMira met her eyes. “Then jail me with my ink,” she said, because she had her father’s nerve at last. “The country is larger than the forms you have filed.”\n\nThe mayor looked at the square, the well, the people who had not been on any census, and Mira saw her swallow the part of the law that had always been a lie. “We will re-file,” the mayor said finally. “We will re-file the land.”\n\nThat night, the bell on Mira’s door rang true, once, a clean sound. Mira oiled the wire the way her father would have, smiling. Outside, a new river shone, not weeping anymore, bound for a sea the old maps had forgotten to name.",
      },
    ],
  },
  "sample-signal": {
    id: "sample-signal",
    title: "Signal",
    genre: "Literary Fiction",
    tone: "Minimalist",
    synopsis:
      "Three people in three cities receive the same letter on the same morning. None of them know each other. All of them are about to.",
    coverFrom: "#0a1628",
    coverVia: "#1a2e4a",
    coverTo: "#0a1628",
    coverAccent: "#38bdf8",
    coverImageUrl: "/sample-covers/signal-cover.png",
    wordCount: 1280,
    chapterCount: 4,
    createdAt: "2026-04-10",
    status: "complete",
    chapters: [
      {
        number: 1,
        title: "Copies",
        content:
          "Ansel found the letter tucked inside his screen door, no stamp, his name in blue ink. One sentence: If you are reading this, the signal already reached you. He stood on the porch, coffee cooling, the city not yet loud.\n\nIn Reykjavik, Lina discovered the same sentence on her studio table, under a pot she had not moved in weeks. The paper was dry. It had not been there yesterday.\n\nIn Kuala Lumpur, Rohan’s niece brought the mail up with the milk. The envelope had his address but no sender. The sentence pulsed, ridiculous and precise.\n\nNone of them knew the handwriting. All of them, against habit, did not throw it away.",
      },
      {
        number: 2,
        title: "Triangulation",
        content:
          "Ansel was an engineer. He made lists. He put the paper under a lamp, photographed fibers, sent images to a friend in forensics, felt foolish, felt scared. The fibers were common. The ink was common. The sentence was a key without notches.\n\nLina painted. She set the page beside a canvas and mixed a gray that did not match anything in the room, then realized the gray was exactly the color of a sky she had dreamed as a child, a place without maps.\n\nRohan taught history to teenagers who thought the past was a playlist. He read the line aloud, once, in class by accident, and a girl in the second row flinched, then raised her hand. “My grandmother used to say that,” she said. “About the signal.”\n\n“What signal?”\n\nThe girl hesitated. “The one you answer without speaking.”\n\nAfter class, she brought him a photo: three strangers at an airport, none touching, all looking at the same blank wall. The date was wrong for everyone’s memory of that year.",
      },
      {
        number: 3,
        title: "Convergence",
        content:
          "The second letter arrived a week later. This time, coordinates. Ansel plotted them, swore, plotted again — a triangle: his city, Lina’s, Rohan’s. A plane could connect them, but the letters had not been mailed. A net could, but the paper was too physical to be a glitch.\n\nLina saw the same coordinates in the grain of a painting she had abandoned. She had not painted them. The canvas had, she would say later, the way a tide finds a mark on sand.\n\nRohan’s niece stopped coming to class. When he went to her apartment, a neighbor said she had left for a trip, destination unknown, bag small as if she was only stepping out. On her desk, the third page: three handprints, overlapping, in ink that smeared as if the paper had been held too long.\n\nAnsel, Lina, and Rohan found each other first online, then in a chat that felt both absurd and late. “You feel it, right?” Ansel typed. “A hum.”\n\nLina: “In the teeth.”\n\nRohan: “In the old stories.”\n\nThey did not use the word magic. They used the word signal because it was the only word the letters allowed.",
      },
      {
        number: 4,
        title: "Answer",
        content:
          "They met in a city in the center of the triangle, not the geometric center, the human one — a place cheap to fly to, indifferent, full of bad coffee and long counters. The girl from Rohan’s class was there, older than a week should allow, with a look that said: finally.\n\nShe placed a fourth sheet on the table. It was blank. “You have to write it together,” she said. “The signal doesn’t work if one of you is alone.”\n\nAnsel wanted to scoff. Lina wanted to paint the blank. Rohan thought of his students, of history, of how every revolution needed three voices minimum: witness, scribe, and the one who had to act.\n\nThe ink appeared when all three held the pen, not a séance, a physics — a decision shared so completely it had mass.\n\nThe sentence that formed was not dramatic. It was a list of names, some dead, some living, a handful crossed out, a handful underlined, and at the bottom: Keep going.\n\nThey ate dinner at a bad café and laughed, surprised. The signal, they agreed, was not a command. It was a quorum.\n\nOutside, the city’s noise returned. Somewhere, another envelope slid under another door, waiting for the next set of three who did not know each other, who would.",
      },
    ],
  },
  "sample-garden": {
    id: "sample-garden",
    title: "The Garden Between Clocks",
    genre: "Magical Realism",
    tone: "Whimsical",
    synopsis:
      "An old clockmaker discovers a garden that exists outside of time, where the people she has loved and lost are still alive, waiting patiently.",
    coverFrom: "#0d2b1a",
    coverVia: "#1a4a2e",
    coverTo: "#0d2b1a",
    coverAccent: "#4ade80",
    coverImageUrl: "/sample-covers/garden-between-clocks-cover.png",
    wordCount: 1100,
    chapterCount: 4,
    createdAt: "2026-04-05",
    status: "draft",
    chapters: [
      {
        number: 1,
        title: "The Ticking Shop",
        content:
          "Etta wound clocks the way other people pet cats — with affection that expected nothing back but presence. The shop, narrow as a thought, had been her father’s and his father’s, full of tickings that made newcomers dizzy until their bodies learned the rhythm, like standing on a ship.\n\nThe winter she turned sixty-eight, a pendulum in the back room began to beat half a second behind the world. She checked the weight, the escapement, the oil. Nothing. The lag stayed.\n\nOne evening, the lag opened into a door.\n\nNot a metaphor. A door where the wainscoting had been, wood older than the building, knotted with brass screws shaped like little suns. The air through the jamb smelled like lilies in rain and her mother’s kitchen on a day there had been no lilies, no kitchen, in forty years.\n\nEtta stepped through. The shop noise dropped away as if a lid had been placed on a pot. The garden on the other side was not large. It was not small. It was exactly the size of a life if you could walk the perimeter in the time it took a kettle to hum toward boil.\n\nIn the first row, her mother weeded a bed, humming. She looked up, unsurprised. “You’re early,” she said, “and late.”\n\nEtta, who prided herself on composure, sat down on a stone and cried in gasps, the way children do when they cannot name what hurts.",
      },
      {
        number: 2,
        title: "Between Hours",
        content:
          "Time in the garden was not a line. It was a set of concentric rings, the way a tree has rings, each one a year you could visit if you knew where to place your foot.\n\nEtta’s father sat on a bench mending a clock face the color of a storm. “Do not try to take anyone back with you,” he said, not unkind. “The shop can only keep one of you, and you’re the one with grease on your hands.”\n\n“I don’t want to take,” Etta said. “I want to —”\n\n“To understand,” he finished. “Good. The garden is for understanding, not for theft.”\n\nShe walked paths where seconds pooled like water in hollows, where her first love, embarrassingly young, picked berries from a bush that, in the outside world, had been torn out decades ago to widen a road. He waved. She waved back. The berry juice on her fingers tasted the same — tart, a little selfish, a little kind.\n\nA voice behind her, her sister: “You always come when you are tired. Next time, come when you are brave.”\n\nEtta laughed, wet-eyed. “I’ll try.”\n\nThe garden, she thought, was not a heaven. It was a workshop for grief — tools laid out, instructions blunt: handle what is unfinished so the clocks on the other side can keep time without skipping.",
      },
      {
        number: 3,
        title: "The People Who Waited",
        content:
          "They were not all family. A teacher who had believed in her when she did not yet believe in her hands. A friend who had died in a year Etta had tried to file away, neat as a tax receipt, and failed. A dog with a red collar, tail thumping, who in the world had been buried under the lilac, good boy still good, still here.\n\nThe garden let them be as they were at their best, not as death had dressed them. Etta resented that kindness for a full minute, then felt relief so large it was almost violence.\n\n“Why clocks?” she asked her father on another lap of the path.\n\n“Because you measure,” he said. “Because you never stopped wanting to put things right enough to go on. The garden needed someone who would notice half a second.”\n\nEtta thought of the shop, of customers with heirlooms and panics, of the way she had always said, I can make it keep time, even when she meant, I can make it bearable to listen to.\n\nIn the far corner, a child sat by a sundial, drawing spirals. Etta’s child — lost in the sense of a path not taken, not a death: a self she might have been if she had not stayed to mind the family trade.\n\nThe child held up a paper. A sketch of a door with a pendulum for a knocker. “When you are ready to close it,” the child said, “this is the shape.”\n\nEtta folded the paper, put it in her apron, and let herself feel fear as a form of love.",
      },
      {
        number: 4,
        title: "When the Garden Closes for the Day",
        content:
          "The garden, her mother explained, was not a place you lived. It was a place you went to be reminded that living was a decision you kept making, minute by minute, with or without a pendulum to prove it.\n\nEtta walked out through the door the way you leave a good conversation — wanting one more word, taking none. The shop rushed back, all the clocks a little cacophony, a faithful chaos. The half-second lag was gone. The door behind the wainscoting was wainscoting again.\n\nOn the workbench, a small brass screw shaped like a sun, warm as if it had been held. A note in her own handwriting, in pencil: Keep the door oiled, love.\n\nShe oiled the hinges on the front door, then the back, then every clock in the place until her wrists ached. When the last customer of the day left, an old man with a pocket watch and shaky hope, Etta set his timepiece, wound it, listened, and said, with new steadiness, “It will not lose you.”\n\nOutside, the city kept its rude noise. Somewhere, she knew, the garden between clocks was still there for others who measured too carefully to sleep. She was not the only one who tended thresholds.\n\nThat night, she wound her own little alarm clock, set it, and for the first time in years, did not lie awake waiting for a tick to fail. The ticks came, evenly, a kind of story that would continue without her, and with her, at once. That, she thought, was the only magic worth keeping.",
      },
    ],
  },
};

export function getExtraExampleBookById(id: string): Book | undefined {
  return extraExampleBooks[id];
}
