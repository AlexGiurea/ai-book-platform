"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  Globe2,
  ImageIcon,
  NotebookPen,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { cn } from "@/lib/utils";

const genres = [
  "Literary Fiction",
  "Science Fiction",
  "Fantasy",
  "Historical Fiction",
  "Mystery",
  "Thriller",
  "Magical Realism",
  "Horror",
  "Romance",
  "Non-Fiction",
  "Biography",
  "Philosophy",
];

const tones = [
  "Contemplative",
  "Lyrical",
  "Tense",
  "Whimsical",
  "Minimalist",
  "Epic",
  "Intimate",
  "Satirical",
  "Dark",
  "Hopeful",
];

const povOptions = [
  { label: "Infer from idea", value: "", desc: "Let the story decide" },
  { label: "First person", value: "first", desc: "I / we narration" },
  { label: "Third person", value: "third", desc: "He / she / they narration" },
];

const lengths = [
  { label: "Dev short", value: "dev",    desc: "~90 PDF pages, ~12k words · quick test" },
  { label: "Short",     value: "short",  desc: "~170 PDF pages, ~24k words" },
  { label: "Medium",    value: "medium", desc: "~285 PDF pages, ~40k words" },
  { label: "Novel",     value: "long",   desc: "~425 PDF pages, ~60k words" },
  { label: "Epic",      value: "large",  desc: "~850 PDF pages, ~120k words" },
  { label: "Tome",      value: "tome",   desc: "~1,325 PDF pages, ~188k words" },
];

const imageStyles = [
  { label: "None", value: "none" },
  { label: "Painterly", value: "painterly" },
  { label: "Line art", value: "lineart" },
  { label: "Watercolor", value: "watercolor" },
  { label: "Dark ink", value: "darkink" },
  { label: "Cinematic", value: "cinematic" },
];

interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

interface CanvasCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
}

interface CanvasWorldEntry {
  id: string;
  title: string;
  content: string;
}

interface CanvasNote {
  id: string;
  title: string;
  content: string;
}

type CanvasPanel = "documents" | "characters" | "world" | "notes" | null;

const uid = () =>
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

export default function CreatePage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const documentsInputRef = useRef<HTMLInputElement>(null);

  const [idea, setIdea] = useState("");

  // Canvas state
  const [documents, setDocuments] = useState<UploadedFile[]>([]);
  const [characters, setCharacters] = useState<CanvasCharacter[]>([]);
  const [worldEntries, setWorldEntries] = useState<CanvasWorldEntry[]>([]);
  const [notes, setNotes] = useState<CanvasNote[]>([]);

  const [canvasOpen, setCanvasOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<CanvasPanel>(null);
  const [dragOver, setDragOver] = useState(false);

  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [pov, setPov] = useState("");
  const [length, setLength] = useState("medium");
  const [imageStyle, setImageStyle] = useState("painterly");
  const [showOptions, setShowOptions] = useState(false);

  const canvasItemCount =
    documents.length + characters.length + worldEntries.length + notes.length;
  const canGenerate = idea.trim().length > 10 || canvasItemCount > 0;

  const resizeIdeaTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    el.style.overflowY = el.scrollHeight > 320 ? "auto" : "hidden";
  }, []);

  const handleTextareaInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setIdea(e.target.value);
      resizeIdeaTextarea(e.target);
    },
    [resizeIdeaTextarea]
  );

  useEffect(() => {
    if (textareaRef.current) resizeIdeaTextarea(textareaRef.current);
  }, [idea, resizeIdeaTextarea]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addDocuments = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setDocuments((prev) => [...prev, ...newFiles]);
  };

  const handleDocDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addDocuments(e.dataTransfer.files);
  };

  const addCharacter = () =>
    setCharacters((prev) => [
      ...prev,
      { id: uid(), name: "", role: "", description: "" },
    ]);
  const updateCharacter = (id: string, patch: Partial<CanvasCharacter>) =>
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  const removeCharacter = (id: string) =>
    setCharacters((prev) => prev.filter((c) => c.id !== id));

  const addWorld = () =>
    setWorldEntries((prev) => [...prev, { id: uid(), title: "", content: "" }]);
  const updateWorld = (id: string, patch: Partial<CanvasWorldEntry>) =>
    setWorldEntries((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
    );
  const removeWorld = (id: string) =>
    setWorldEntries((prev) => prev.filter((w) => w.id !== id));

  const addNote = () =>
    setNotes((prev) => [...prev, { id: uid(), title: "", content: "" }]);
  const updateNote = (id: string, patch: Partial<CanvasNote>) =>
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const removeNote = (id: string) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  const handleGenerate = () => {
    if (!canGenerate) return;

    const canvasPayload = {
      characters: characters
        .filter((c) => c.name.trim() || c.description.trim())
        .map((c) => ({
          name: c.name.trim() || "(unnamed)",
          role: c.role.trim() || undefined,
          description: c.description.trim(),
        })),
      world: worldEntries
        .filter((w) => w.title.trim() || w.content.trim())
        .map((w) => ({
          title: w.title.trim() || "(untitled)",
          content: w.content.trim(),
        })),
      notes: notes
        .filter((n) => n.title.trim() || n.content.trim())
        .map((n) => ({
          title: n.title.trim() || undefined,
          content: n.content.trim(),
        })),
    };

    const hasCanvasContent =
      documents.length > 0 ||
      canvasPayload.characters.length > 0 ||
      canvasPayload.world.length > 0 ||
      canvasPayload.notes.length > 0;

    const params = {
      idea,
      mode: hasCanvasContent ? (idea.trim() ? "canvas" : "upload") : "text",
      genre,
      tone,
      pov,
      length,
      imageStyle,
      contextFiles: documents.map((f) => f.name),
      canvas: hasCanvasContent ? canvasPayload : undefined,
    };
    sessionStorage.setItem("bookParams", JSON.stringify(params));
    router.push("/generating");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
  };

  const canvasTiles: {
    key: Exclude<CanvasPanel, null>;
    label: string;
    sub: string;
    icon: typeof FileText;
    count: number;
    accent: string;
  }[] = [
    {
      key: "documents",
      label: "Documents",
      sub: "Outlines, manuscripts, notes",
      icon: FileText,
      count: documents.length,
      accent: "from-ember-100 to-ember-200 text-ember-600 border-ember-200",
    },
    {
      key: "characters",
      label: "Characters",
      sub: "Names, voices, arcs",
      icon: Users,
      count: characters.length,
      accent: "from-rose-100 to-rose-200 text-rose-600 border-rose-200",
    },
    {
      key: "world",
      label: "Worldbuilding",
      sub: "Settings, rules, lore",
      icon: Globe2,
      count: worldEntries.length,
      accent: "from-sky-100 to-sky-200 text-sky-600 border-sky-200",
    },
    {
      key: "notes",
      label: "Notes",
      sub: "Themes, references, scraps",
      icon: NotebookPen,
      count: notes.length,
      accent: "from-amber-100 to-amber-200 text-amber-600 border-amber-200",
    },
  ];

  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-ember-100/50 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-dust-100/40 blur-[80px]" />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember-100 border border-ember-200 text-ember-600 text-xs font-medium mb-5">
            <Sparkles size={11} />
            New Book
          </div>
          <h1 className="font-serif text-4xl font-bold text-ink-500 mb-3">
            What&apos;s your book about?
          </h1>
          <p className="text-ink-300 text-base">
            Start with an idea, pour in your raw material, or build the whole world on the canvas.
          </p>
        </motion.div>

        {/* ─── Idea textarea (always visible) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="glass-card rounded-2xl overflow-hidden"
        >
          <textarea
            ref={textareaRef}
            aria-label="Book idea prompt"
            value={idea}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={`Describe your book idea…

· "A mystery about a lighthouse keeper who receives letters from the future"
· "A lore book for a world where music is the source of all magic"
· "Turn these character notes into a fantasy novel: Aria is a cartographer who discovers her maps are changing on their own…"`}
            className="w-full min-h-[180px] max-h-[320px] overscroll-contain p-6 pb-4 pr-8 bg-transparent text-ink-400 placeholder-ink-200 text-[15px] leading-relaxed focus:outline-none font-sans resize-none overflow-y-auto"
            style={{ minHeight: "180px", scrollbarGutter: "stable" }}
          />
          <div className="flex items-center justify-end px-4 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-200">
                {idea.length > 0 && `${idea.length} chars`}
              </span>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                  canGenerate
                    ? "bg-ink-500 hover:bg-ink-400 text-parchment-50 shadow-warm-sm hover:shadow-warm"
                    : "bg-parchment-300/50 text-ink-200 cursor-not-allowed"
                )}
              >
                <ArrowUp size={14} />
                Generate Book
              </button>
            </div>
          </div>
        </motion.div>

        {/* ─── Creative Canvas trigger — prominent, obviously a file/idea hub ─── */}
        <motion.button
          type="button"
          onClick={() => setCanvasOpen((v) => !v)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}
          whileHover={{ y: -1 }}
          className={cn(
            "group relative mt-4 w-full overflow-hidden rounded-2xl border-2 border-dashed cursor-pointer text-left transition-all duration-200",
            canvasOpen
              ? "border-ember-400 bg-ember-100/60 shadow-warm-sm"
              : "border-ember-300 bg-gradient-to-br from-ember-100/70 via-parchment-100 to-dust-100/50 hover:border-ember-400 hover:shadow-warm-sm"
          )}
        >
          {/* Soft animated glow */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-ember-300/40 blur-3xl"
            animate={{ x: [0, 20, 0], y: [0, 10, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -bottom-12 -right-8 w-44 h-44 rounded-full bg-dust-300/30 blur-3xl"
            animate={{ x: [0, -16, 0], y: [0, -8, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />

          <div className="relative flex items-center gap-4 p-4 sm:p-5">
            {/* Icon */}
            <div className="relative shrink-0">
              <motion.div
                className="w-12 h-12 rounded-xl bg-ember-500 text-white flex items-center justify-center shadow-ember"
                animate={{
                  rotate: canvasOpen ? 0 : [0, -6, 0, 6, 0],
                }}
                transition={{
                  duration: 3.6,
                  repeat: canvasOpen ? 0 : Infinity,
                  ease: "easeInOut",
                }}
              >
                <Upload size={18} strokeWidth={2.2} />
              </motion.div>
              <motion.div
                aria-hidden
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-ember-300 flex items-center justify-center text-ember-600"
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Plus size={10} strokeWidth={2.6} />
              </motion.div>
            </div>

            {/* Label + category preview */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base sm:text-[17px] font-semibold text-ink-500">
                  Creative canvas
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ember-600 bg-white/70 border border-ember-200 rounded-full px-2 py-0.5">
                  Upload · Build · Pour in
                </span>
                {canvasItemCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-ember-500 text-white text-[11px] font-semibold">
                    {canvasItemCount}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-300 leading-snug mb-2.5">
                Drop in documents, sketch characters, map a world, stash notes.
                Everything you add becomes canon for the planner.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { icon: FileText, label: "Documents", count: documents.length },
                  { icon: Users, label: "Characters", count: characters.length },
                  { icon: Globe2, label: "World", count: worldEntries.length },
                  { icon: NotebookPen, label: "Notes", count: notes.length },
                ].map((c) => {
                  const Icon = c.icon;
                  return (
                    <span
                      key={c.label}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        c.count > 0
                          ? "bg-ember-500 border-ember-500 text-white"
                          : "bg-white/80 border-parchment-300 text-ink-300 group-hover:border-ember-300 group-hover:text-ink-500"
                      )}
                    >
                      <Icon size={11} />
                      {c.label}
                      {c.count > 0 && (
                        <span className="ml-0.5 opacity-90">{c.count}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Chevron */}
            <motion.div
              className="shrink-0 text-ink-300 group-hover:text-ink-500 transition-colors"
              animate={{ rotate: canvasOpen ? 180 : 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <ChevronDown size={20} />
            </motion.div>
          </div>
        </motion.button>

        {/* ─── Creative Canvas ─── */}
        <AnimatePresence initial={false}>
          {canvasOpen && (
            <motion.div
              key="canvas"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-serif text-lg font-semibold text-ink-500">
                      Creative canvas
                    </h3>
                    <p className="text-xs text-ink-300 mt-0.5">
                      Pour in documents, characters, worldbuilding, or stray notes. Folio weaves all of it into the blueprint.
                    </p>
                  </div>
                </div>

                {/* Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {canvasTiles.map((tile) => {
                    const Icon = tile.icon;
                    const active = activePanel === tile.key;
                    return (
                      <button
                        key={tile.key}
                        onClick={() =>
                          setActivePanel(active ? null : tile.key)
                        }
                        className={cn(
                          "relative flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-all duration-200 cursor-pointer border",
                          active
                            ? "bg-white border-ink-300 shadow-warm-sm"
                            : "bg-parchment-100/60 border-parchment-300/60 hover:border-ink-200 hover:bg-parchment-100"
                        )}
                      >
                        <div
                          className={cn(
                            "w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center border",
                            tile.accent
                          )}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-ink-500">
                            {tile.label}
                          </span>
                          {tile.count > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-ink-500 text-parchment-50 text-[10px] font-semibold">
                              {tile.count}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-ink-200 leading-snug">
                          {tile.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active panel */}
                <AnimatePresence initial={false} mode="wait">
                  {activePanel && (
                    <motion.div
                      key={activePanel}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4 rounded-xl bg-parchment-100/70 border border-parchment-300/70 p-4"
                    >
                      {activePanel === "documents" && (
                        <div>
                          <input
                            ref={documentsInputRef}
                            type="file"
                            multiple
                            accept=".txt,.md,.doc,.docx,.pdf"
                            className="hidden"
                            onChange={(e) => addDocuments(e.target.files)}
                          />
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOver(true);
                            }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDocDrop}
                            onClick={() => documentsInputRef.current?.click()}
                            className={cn(
                              "rounded-xl border-2 border-dashed px-4 py-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
                              dragOver
                                ? "border-ember-400 bg-ember-100/40"
                                : "border-parchment-300 bg-white/50 hover:border-ember-300 hover:bg-white"
                            )}
                          >
                            <Upload size={18} className="text-ink-300 mb-2" />
                            <p className="text-sm text-ink-400 font-medium">
                              Drop documents here
                            </p>
                            <p className="text-xs text-ink-200 mt-0.5">
                              or click · .txt · .md · .doc · .docx · .pdf
                            </p>
                          </div>
                          {documents.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              {documents.map((f, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/70 border border-parchment-300/70"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText
                                      size={13}
                                      className="text-ink-300 shrink-0"
                                    />
                                    <span className="text-sm text-ink-400 truncate">
                                      {f.name}
                                    </span>
                                    <span className="text-xs text-ink-200 shrink-0">
                                      {formatBytes(f.size)}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() =>
                                      setDocuments((prev) =>
                                        prev.filter((_, j) => j !== i)
                                      )
                                    }
                                    className="text-ink-200 hover:text-ink-400 p-1 rounded-md hover:bg-parchment-200/60 cursor-pointer"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {activePanel === "characters" && (
                        <div className="space-y-3">
                          {characters.length === 0 && (
                            <p className="text-xs text-ink-200 px-1">
                              Add characters you want in the book. Name, role, voice, arc — anything you write here becomes canon for the planner.
                            </p>
                          )}
                          {characters.map((c) => (
                            <div
                              key={c.id}
                              className="rounded-xl bg-white/70 border border-parchment-300/70 p-3 space-y-2"
                            >
                              <div className="flex gap-2">
                                <input
                                  value={c.name}
                                  onChange={(e) =>
                                    updateCharacter(c.id, {
                                      name: e.target.value,
                                    })
                                  }
                                  placeholder="Name"
                                  className="flex-1 bg-transparent text-sm text-ink-500 placeholder-ink-200 font-medium focus:outline-none"
                                />
                                <input
                                  value={c.role}
                                  onChange={(e) =>
                                    updateCharacter(c.id, {
                                      role: e.target.value,
                                    })
                                  }
                                  placeholder="Role (protagonist, foil…)"
                                  className="flex-1 bg-transparent text-xs text-ink-300 placeholder-ink-200 focus:outline-none"
                                />
                                <button
                                  onClick={() => removeCharacter(c.id)}
                                  className="text-ink-200 hover:text-ink-400 p-1 rounded-md hover:bg-parchment-200/60 cursor-pointer"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              <textarea
                                value={c.description}
                                onChange={(e) =>
                                  updateCharacter(c.id, {
                                    description: e.target.value,
                                  })
                                }
                                placeholder="Description, voice, motivation, arc, secrets…"
                                rows={3}
                                className="w-full bg-parchment-100/70 rounded-lg p-2 text-sm text-ink-400 placeholder-ink-200 focus:outline-none resize-none border border-parchment-300/60"
                              />
                            </div>
                          ))}
                          <button
                            onClick={addCharacter}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-parchment-300 px-3 py-2.5 text-sm text-ink-300 hover:text-ink-500 hover:border-ink-200 hover:bg-white/60 transition-colors cursor-pointer"
                          >
                            <Plus size={14} />
                            Add character
                          </button>
                        </div>
                      )}

                      {activePanel === "world" && (
                        <div className="space-y-3">
                          {worldEntries.length === 0 && (
                            <p className="text-xs text-ink-200 px-1">
                              Describe the world: magic systems, physics, cultures, locations, timelines. Each entry is a piece of canon the planner will honor.
                            </p>
                          )}
                          {worldEntries.map((w) => (
                            <div
                              key={w.id}
                              className="rounded-xl bg-white/70 border border-parchment-300/70 p-3 space-y-2"
                            >
                              <div className="flex gap-2">
                                <input
                                  value={w.title}
                                  onChange={(e) =>
                                    updateWorld(w.id, {
                                      title: e.target.value,
                                    })
                                  }
                                  placeholder="Title (e.g. 'The Umberwood', 'Magic rules')"
                                  className="flex-1 bg-transparent text-sm text-ink-500 placeholder-ink-200 font-medium focus:outline-none"
                                />
                                <button
                                  onClick={() => removeWorld(w.id)}
                                  className="text-ink-200 hover:text-ink-400 p-1 rounded-md hover:bg-parchment-200/60 cursor-pointer"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              <textarea
                                value={w.content}
                                onChange={(e) =>
                                  updateWorld(w.id, {
                                    content: e.target.value,
                                  })
                                }
                                placeholder="Describe this piece of the world…"
                                rows={3}
                                className="w-full bg-parchment-100/70 rounded-lg p-2 text-sm text-ink-400 placeholder-ink-200 focus:outline-none resize-none border border-parchment-300/60"
                              />
                            </div>
                          ))}
                          <button
                            onClick={addWorld}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-parchment-300 px-3 py-2.5 text-sm text-ink-300 hover:text-ink-500 hover:border-ink-200 hover:bg-white/60 transition-colors cursor-pointer"
                          >
                            <Plus size={14} />
                            Add worldbuilding entry
                          </button>
                        </div>
                      )}

                      {activePanel === "notes" && (
                        <div className="space-y-3">
                          {notes.length === 0 && (
                            <p className="text-xs text-ink-200 px-1">
                              Themes, references, fragments, quotations — anything that should orbit the book without being a document, character, or world rule.
                            </p>
                          )}
                          {notes.map((n) => (
                            <div
                              key={n.id}
                              className="rounded-xl bg-white/70 border border-parchment-300/70 p-3 space-y-2"
                            >
                              <div className="flex gap-2">
                                <input
                                  value={n.title}
                                  onChange={(e) =>
                                    updateNote(n.id, { title: e.target.value })
                                  }
                                  placeholder="Title (optional)"
                                  className="flex-1 bg-transparent text-sm text-ink-500 placeholder-ink-200 font-medium focus:outline-none"
                                />
                                <button
                                  onClick={() => removeNote(n.id)}
                                  className="text-ink-200 hover:text-ink-400 p-1 rounded-md hover:bg-parchment-200/60 cursor-pointer"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              <textarea
                                value={n.content}
                                onChange={(e) =>
                                  updateNote(n.id, { content: e.target.value })
                                }
                                placeholder="Write your note…"
                                rows={3}
                                className="w-full bg-parchment-100/70 rounded-lg p-2 text-sm text-ink-400 placeholder-ink-200 focus:outline-none resize-none border border-parchment-300/60"
                              />
                            </div>
                          ))}
                          <button
                            onClick={addNote}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-parchment-300 px-3 py-2.5 text-sm text-ink-300 hover:text-ink-500 hover:border-ink-200 hover:bg-white/60 transition-colors cursor-pointer"
                          >
                            <Plus size={14} />
                            Add note
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Options panel */}
        <motion.div
          className="mt-10 pt-6 border-t border-parchment-300/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={cn(
              "group flex items-center gap-3 w-full px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 border",
              showOptions
                ? "bg-white border-parchment-300 shadow-warm-sm"
                : "bg-parchment-200/50 border-parchment-300/70 hover:bg-white hover:border-parchment-300 hover:shadow-warm-sm"
            )}
          >
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0",
                showOptions
                  ? "bg-ink-500 text-parchment-50"
                  : "bg-white border border-parchment-300 text-ink-400 group-hover:bg-ink-500 group-hover:text-parchment-50 group-hover:border-ink-500"
              )}
            >
              <SlidersHorizontal size={15} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[15px] font-semibold text-ink-500 leading-tight">
                {showOptions ? "Hide options" : "Customize your book"}
              </div>
              <div className="text-[11px] text-ink-300 mt-0.5">
                {(genre || tone || pov) && !showOptions ? (
                  <span className="text-ember-600 font-medium">
                    {[
                      genre,
                      tone,
                      povOptions.find((o) => o.value === pov)?.label,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : (
                  "Genre · tone · POV · length · illustration style"
                )}
              </div>
            </div>
            <motion.div
              animate={{ rotate: showOptions ? 180 : 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-ink-300 group-hover:text-ink-500 shrink-0"
            >
              <ChevronDown size={18} />
            </motion.div>
          </button>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="glass-card rounded-2xl p-6 space-y-6 mt-2">
                  {/* Genre */}
                  <div>
                    <label className="text-xs font-medium text-ink-300 uppercase tracking-wider mb-3 block">
                      Genre
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {genres.map((g) => (
                        <button
                          key={g}
                          onClick={() => setGenre(genre === g ? "" : g)}
                          className={cn(
                            "px-3.5 py-1.5 rounded-full text-sm transition-all duration-150 cursor-pointer",
                            genre === g
                              ? "bg-ink-500 text-parchment-50"
                              : "bg-parchment-200/60 text-ink-300 hover:bg-parchment-200 hover:text-ink-500"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="text-xs font-medium text-ink-300 uppercase tracking-wider mb-3 block">
                      Tone
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {tones.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTone(tone === t ? "" : t)}
                          className={cn(
                            "px-3.5 py-1.5 rounded-full text-sm transition-all duration-150 cursor-pointer",
                            tone === t
                              ? "bg-ink-500 text-parchment-50"
                              : "bg-parchment-200/60 text-ink-300 hover:bg-parchment-200 hover:text-ink-500"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* POV */}
                  <div>
                    <label className="text-xs font-medium text-ink-300 uppercase tracking-wider mb-3 block">
                      Narrative POV
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {povOptions.map((option) => (
                        <button
                          key={option.value || "infer"}
                          onClick={() => setPov(option.value)}
                          className={cn(
                            "p-4 rounded-xl text-left transition-all duration-150 border cursor-pointer",
                            pov === option.value
                              ? "bg-ink-500 border-ink-500 text-parchment-50"
                              : "bg-parchment-100/60 border-parchment-300/60 text-ink-400 hover:border-ink-200"
                          )}
                        >
                          <div className="text-sm font-medium">{option.label}</div>
                          <div className={cn("text-xs mt-0.5", pov === option.value ? "text-parchment-300" : "text-ink-200")}>
                            {option.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Length */}
                  <div>
                    <label className="text-xs font-medium text-ink-300 uppercase tracking-wider mb-3 block">
                      Length
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {lengths.map((l) => (
                        <button
                          key={l.value}
                          onClick={() => setLength(l.value)}
                          className={cn(
                            "p-4 rounded-xl text-left transition-all duration-150 border cursor-pointer",
                            length === l.value
                              ? "bg-ink-500 border-ink-500 text-parchment-50"
                              : "bg-parchment-100/60 border-parchment-300/60 text-ink-400 hover:border-ink-200"
                          )}
                        >
                          <div className="text-sm font-medium">{l.label}</div>
                          <div className={cn("text-xs mt-0.5", length === l.value ? "text-parchment-300" : "text-ink-200")}>
                            {l.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Image style */}
                  <div>
                    <label className="text-xs font-medium text-ink-300 uppercase tracking-wider mb-3 block">
                      <ImageIcon size={11} className="inline mr-1.5" />
                      Illustration style
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {imageStyles.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setImageStyle(s.value)}
                          className={cn(
                            "px-3.5 py-1.5 rounded-full text-sm transition-all duration-150 cursor-pointer",
                            imageStyle === s.value
                              ? "bg-ember-500 text-white shadow-ember"
                              : "bg-parchment-200/60 text-ink-300 hover:bg-parchment-200 hover:text-ink-500"
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Hint */}
        <motion.p
          className="text-center text-xs text-ink-200 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          Press{" "}
          <kbd className="px-1.5 py-0.5 bg-parchment-200 rounded text-ink-300 font-mono text-[10px]">
            ⌘↵
          </kbd>{" "}
          to generate · Generation takes 2–3 minutes for a full book
        </motion.p>
      </main>
    </div>
  );
}
