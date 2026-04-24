export interface Chapter {
  number: number;
  title: string;
  content: string;
  imagePlaceholder?: string;
}

export interface Book {
  id: string;
  title: string;
  genre: string;
  tone: string;
  synopsis: string;
  coverFrom: string;
  coverVia: string;
  coverTo: string;
  coverAccent: string;
  coverImageUrl?: string;
  wordCount: number;
  chapterCount: number;
  createdAt: string;
  status: "complete" | "draft" | "generating";
  chapters: Chapter[];
}

export const sampleBook: Book = {
  id: "sample-1",
  title: "The Last Archive",
  genre: "Science Fiction",
  tone: "Contemplative",
  synopsis:
    "In a world where memories are stored in crystalline archives, a lone archivist discovers that someone has been systematically erasing the past — and the truth she uncovers threatens to rewrite everything humanity thinks it knows about itself.",
  coverFrom: "#0f172a",
  coverVia: "#1e1b4b",
  coverTo: "#0f172a",
  coverAccent: "#818cf8",
  wordCount: 18400,
  chapterCount: 7,
  createdAt: "2026-04-20",
  status: "complete",
  chapters: [
    {
      number: 1,
      title: "The Weight of Forgotten Things",
      imagePlaceholder: "A vast crystalline hall stretching to infinity, filled with glowing blue memory shards suspended in darkness",
      content: `The Archive smelled of time itself — that particular stillness you find only in places where the past has been carefully folded and stored away, like linen pressed too long in a cedar chest.

Maren Voss had worked the lower vaults for eleven years without incident. She knew every shelf, every sequence number, every faint hum the climate controls made at three in the morning when the city outside went quiet enough to hear itself breathe. The Archive was not a building to her. It was a kind of weather — something she moved through rather than inhabited.

She noticed the gap on a Tuesday.

Sector 7, Row 14, Position 88 through 112. Twenty-four memory cores, each the size of a fist, each containing between four and nine years of lived human experience. Gone. Not misplaced — she had checked. The mounting brackets were clean, the dust undisturbed in a way that only happened when something was removed deliberately, with care, by someone who knew exactly what they were taking.

Maren stood for a long time in front of that empty shelf. Outside, the city continued its slow turning. Inside, twenty-four people's lives had simply ceased to exist.

She filed a report. She was told it was a cataloguing error.

She did not believe that. She had never believed easy explanations for precise things.`,
    },
    {
      number: 2,
      title: "What the Cores Remember",
      content: `The memory cores were not supposed to be readable without a licensed reader unit and a consent key. Maren had both — the reader unit from the equipment closet on sublevel three, the consent key from a man named Aldous who owed her three favors and was too careful about his debts to ask questions.

She chose a core at random from the adjacent row. Not one of the missing ones, obviously. One that had been there long enough to gather the particular patina that meant it had never been touched since intake.

The memory belonged to a woman who had been a ferry pilot on the northern crossing in the years before the Consolidation. Maren sat with the playback running at quarter speed and watched seventeen minutes of morning water — gray, cold, the engine vibrating through the deck plates into the woman's hands — and felt something she could not name. Not grief exactly. Something quieter. The awareness that a specific quality of light on a specific stretch of water, seen through one particular pair of eyes, existed only here. That without the Archive, that Tuesday morning in the thirty-first year of a life Maren would never know, simply would not exist anywhere in the world.

This was why the erasure mattered.

It was not, she understood now, a crime against information. It was a crime against the texture of things.`,
    },
    {
      number: 3,
      title: "The Compiler",
      imagePlaceholder: "A shadowy figure in a long coat walking through corridors of glowing data columns, reflected in polished dark floors",
      content: `His name was not in any personnel file she could access, which was itself a kind of answer. The Archive employed four hundred and twelve people across its twelve operating levels. Every one of them had a file: intake photograph, clearance tier, work history, the small bureaucratic accumulation of a person who existed inside a system.

The man Maren began calling the Compiler had no file. He had a badge — she had seen it, once, in passing, on a Monday she had worked late to recatalog the incident records from the post-storm intake surge. His badge was green. Green clearance did not exist in the Archive's official hierarchy. She had checked.

She started watching the camera logs.

It took her nine days to find a pattern. He came in at irregular intervals, always through the service entrance on the building's east side, always between the shift changes when the cameras experienced their routine three-minute calibration gaps. He moved through the building like someone who had memorized it — not like an employee, but like a person who had once owned the place and was visiting to verify that it was still standing.

On the seventeenth day, she followed him.

He went down to sublevel six, which officially did not exist.`,
    },
    {
      number: 4,
      title: "Sublevel Six",
      content: `The elevator did not go to sublevel six. She took the maintenance stairs, which required her second clearance card and a specific sequence of pressure-pad inputs that she had learned by watching a supervisor do it once, three years ago, while pretending to look at a broken climate sensor.

The stairwell smelled different. Older. The concrete was a slightly different shade — poured in a different decade, by different hands. Someone had built this level and then carefully removed it from every official document while leaving the physical space intact.

What she found was not what she expected.

She had expected servers. Hardware. The infrastructure of erasure.

She found instead a reading room.

Long tables. Chairs. A hundred small lamps casting warm pools of light. And at those tables, sitting quietly with reader units and consent keys arranged before them like dinner settings, a dozen people who looked up when she entered with the particular stillness of those who have been expecting company.

The oldest of them — a woman whose face carried the particular geography of a life spent largely outdoors — set down her reader and folded her hands.

"We wondered," she said, "when you would find the stairs."`,
    },
    {
      number: 5,
      title: "The Council of Lost Hours",
      imagePlaceholder: "Warm lamplight in an underground reading room, figures gathered around tables covered in glowing memory cores and open manuscripts",
      content: `They called themselves nothing formally. Maren privately named them the Council of Lost Hours, because that was what they collected — not the large dramas of history, not the significant moments that made it into the official record, but the small lost time. The Tuesday ferry crossings. The particular smell of a bakery that had closed in a town that no longer existed. The way a dead language sounded when spoken by the last person who had grown up in it.

The woman who had spoken was named Sable. She had been an archivist too, forty years ago, before a different clearance restructuring had reclassified her position as nonessential and handed her exit papers on a Thursday afternoon without ceremony.

"The cores being taken," Sable said, "are not being destroyed."

Maren, who had assumed this, felt something in her chest recalibrate.

"They are being moved. Consolidated. Into a single collection that will be — controlled. Curated." Sable's voice was careful around this word, the way you were careful around words that had been slowly drained of their original meaning and refilled with something else. "The new owners of the Archive have a vision. They believe that certain memories are not — productive. That certain textures of experience do not serve the forward momentum of a coherent society."

"They're going to edit the past," Maren said.

"They already have."`,
    },
    {
      number: 6,
      title: "What Remains",
      content: `The twenty-four missing cores had belonged to people who had documented the years before the Consolidation from the outside — from the vantage point of those who had stood on the wrong side of the various transitions. Not enemies of the Archive. Not dissidents or saboteurs. Just people who had lived through a particular set of years with their eyes open and their memories intact.

Maren spent three days in sublevel six reading what remained of the surrounding context. The pattern was clear once you knew to look for it: every removed memory shared a specific quality. They captured the time immediately before something changed as it had actually felt to live in it, without the retrospective smoothing that the official record applied.

They were inconvenient because they were true.

"The question," said a man named Farren who had been cataloguing the evidence for two years, "is what we do with what we've found. We have proof. We have the pattern. We know what's being taken and why."

"We need to copy them," Maren said. "Whatever hasn't been taken yet."

"They'll notice."

"Yes," she agreed. "That's the point."

She thought of the ferry pilot's Tuesday morning. The cold water. The engine hum. The specific quality of light on a gray northern crossing that existed nowhere in the world except in those few cubic centimeters of crystallized memory.

Some things were worth the risk of being noticed for.`,
    },
    {
      number: 7,
      title: "The Archive Opens",
      imagePlaceholder: "Dawn light streaming through high windows into a grand archive hall, memory cores glowing softly on open shelves visible to a crowd of people",
      content: `They released the copies on a Thursday, which Maren had chosen deliberately because of its associations with endings that arrived without ceremony.

Sable had contacts — people who had carried small rebellions forward for decades, maintaining the particular infrastructure of things that were not supposed to exist. The distribution took eleven minutes. By the time the Archive's security team had identified the breach, the memories had been received by three hundred and seventeen individuals in twenty-two cities, each of whom had agreed to serve as what Sable called a living redundancy.

Maren waited in sublevel six while it happened. She sat at one of the long tables in the warm lamplight and held one of the uncatalogued cores — one that had never been officially received, that existed in no system, that was simply a life that had been offered to the Archive's care before the current administration had come to power.

She did not put it in the reader. She just held it.

She thought about the nature of preservation — how it was not the same thing as keeping. Keeping was passive. Preservation was a choice made again and again, in the face of everything that worked against it.

When her communicator chimed with the confirmation, she set the core down gently on the table. Outside, the city was moving through its ordinary Thursday. Inside, twenty-four lives had been returned to the world.

She picked up the core and walked back up the stairs, into the Archive, into the long work of ensuring that what had happened once could not simply be made not to have happened.

The work of memory, she had always known, was never finished.

It was only ever interrupted.`,
    },
  ],
};

export const dashboardBooks: Omit<Book, "chapters">[] = [
  {
    id: "sample-1",
    title: "The Last Archive",
    genre: "Science Fiction",
    tone: "Contemplative",
    synopsis: "In a world where memories are stored in crystalline archives, a lone archivist discovers that someone has been systematically erasing the past.",
    coverFrom: "#0f172a",
    coverVia: "#1e1b4b",
    coverTo: "#0f172a",
    coverAccent: "#818cf8",
    wordCount: 18400,
    chapterCount: 7,
    createdAt: "2026-04-20",
    status: "complete",
  },
  {
    id: "sample-2",
    title: "The Cartographer's Daughter",
    genre: "Historical Fantasy",
    tone: "Lyrical",
    synopsis: "A young woman inherits her father's map-making shop and discovers that his most famous maps lead not to places, but to people who have been lost to history.",
    coverFrom: "#1a0a00",
    coverVia: "#4a1800",
    coverTo: "#1a0a00",
    coverAccent: "#f59e0b",
    wordCount: 24100,
    chapterCount: 9,
    createdAt: "2026-04-15",
    status: "complete",
  },
  {
    id: "sample-3",
    title: "Signal",
    genre: "Literary Fiction",
    tone: "Minimalist",
    synopsis: "Three people in three cities receive the same letter on the same morning. None of them know each other. All of them are about to.",
    coverFrom: "#0a1628",
    coverVia: "#1a2e4a",
    coverTo: "#0a1628",
    coverAccent: "#38bdf8",
    wordCount: 12800,
    chapterCount: 5,
    createdAt: "2026-04-10",
    status: "complete",
  },
  {
    id: "sample-4",
    title: "The Garden Between Clocks",
    genre: "Magical Realism",
    tone: "Whimsical",
    synopsis: "An old clockmaker discovers a garden that exists outside of time, where the people she has loved and lost are still alive, waiting patiently.",
    coverFrom: "#0d2b1a",
    coverVia: "#1a4a2e",
    coverTo: "#0d2b1a",
    coverAccent: "#4ade80",
    wordCount: 9600,
    chapterCount: 4,
    createdAt: "2026-04-05",
    status: "draft",
  },
];
