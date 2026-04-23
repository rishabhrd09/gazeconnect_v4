import { useState, useRef, useCallback } from "react";

const MODES = [
  { id: "textbook", label: "Full Textbook", icon: "📖", desc: "Complete multi-book engineering textbook with diagrams & code walkthroughs", meta: "5-7 books · 2,000-3,000 lines" },
  { id: "architecture", label: "Architecture Map", icon: "🗺️", desc: "System design — infrastructure, data flow, ERDs, deployment topology", meta: "3 books · 1,200-1,800 lines" },
  { id: "api-docs", label: "API Reference", icon: "⚡", desc: "Endpoint reference with auth flows, schemas, curl examples, error codes", meta: "4 books · 1,500-2,000 lines" },
  { id: "onboarding", label: "Dev Onboarding", icon: "🚀", desc: "Phase-by-phase guide to run locally in under 45 minutes", meta: "5 phases · 800-1,200 lines" },
  { id: "deep-dive", label: "Feature Deep Dive", icon: "🔬", desc: "Surgical analysis of a single module — data structures, edge cases", meta: "8 sections · 800-1,200 lines" },
  { id: "security", label: "Security Audit", icon: "🛡️", desc: "Auth flows, data validation, OWASP checklist, secrets management", meta: "4 books · 1,000-1,500 lines" },
];

const STACKS = ["Auto-detect","React + Node.js + PostgreSQL","Next.js + Supabase + TypeScript","Django + React + PostgreSQL","FastAPI + React Native + PostgreSQL","Express.js + MongoDB (MERN)","Flutter + Firebase","Spring Boot + Angular + MySQL","Ruby on Rails + PostgreSQL","Go + gRPC + Redis","Laravel + Vue.js + MySQL","Other (specify in notes)"];
const AUDIENCES = ["Junior developers & CS students","Mid-level engineers onboarding","Senior engineers (architecture focus)","Non-technical stakeholders","Open-source contributors"];

function buildPrompt(c, code) {
  const design = `
DESIGN SYSTEM:
FONTS: DM Serif Display (headings), DM Sans (body), JetBrains Mono (code)
COLORS: Page #f7f5f0, Diagrams #0e0e14, Gold #d4a574, Teal #0d9488, Navy #0f1f3d
Code blocks: #0d1117 (GitHub dark). Callouts: concept=teal, warning=gold, info=blue, critical=red
Tables: navy header, alternating #f9fafb rows

DIAGRAM RULES (CRITICAL):
- Inline SVG only, viewBox="0 0 2000 {HEIGHT}", width:100%
- Titles 22-30px, labels 17-20px, nodes min 200px wide
- Background rect fill="#0e0e14", arrow markers 12x12 in defs
- Drop shadows via filter feGaussianBlur stdDeviation=6
- Color-coded by component type

CODE RULES: Use REAL code from codebase, add WHY comments, syntax highlight with .kw .str .fn .cm spans
PROSE: Each chapter starts with context paragraphs, explain as teaching a ${c.audience || "junior developer"}, include "Why this matters"
ACCURACY: All code/routes/env vars/table names must match actual codebase. Flag uncertainty in callouts.`;

  const sections = {
    textbook: `SECTIONS (5-7 books):

BOOK 1 — What Is ${c.name || "This Project"}?
  1.1 Problem & users  1.2 User journey  1.3 High-level architecture
  1.4 Technical promises  1.5 Tech choices & WHY  1.6 File tree walkthrough

BOOK 2 — How Everything Connects
  2.1 Layer stack diagram  2.2 Database ERD  2.3 Environment comparison
  2.4 Auth flow (sequence diagram)  2.5 Data contracts  2.6 Key algorithm

BOOK 3 — Frontend Layer
  3.1 Framework fundamentals  3.2 Entry point & routing  3.3 State management
  3.4 API client layer  3.5 Screen walkthrough table  3.6 Data flow diagram

BOOK 4 — Backend / API Layer
  4.1 Backend basics + HTTP codes  4.2 Annotated real route  4.3 Config & env vars
  4.4 Database layer (ORM, pooling)  4.5 Auth & security  4.6 CRUD patterns
  4.7 Error handling & validation  4.8 Testing approach

BOOK 5 — DevOps & Deployment
  5.1 Git workflow  5.2 CI/CD pipeline diagram  5.3 Local dev setup
  5.4 Container/build system  5.5 Production deployment  5.6 Monitoring

BOOK 6 — Data Layer Deep Dive
  6.1 Schema documentation  6.2 Migrations  6.3 Query optimization  6.4 Caching  6.5 Backups

APPENDIX: A. Env vars table  B. Tech stack table  C. Topic index  D. Glossary  E. Further reading

Required diagrams (ALL): 1. User journey  2. Infrastructure  3. ERD  4. Auth sequence  5. Data flow  6. CI/CD pipeline  7. State management`,

    architecture: `SECTIONS (3 books):

BOOK 1 — System Overview: Problem domain, C4 Level 1 & 2, Tech trade-offs, Component inventory, Communication patterns
BOOK 2 — Data Architecture: Complete ERD, Data flow diagram, State machines, Caching & invalidation, Event schemas
BOOK 3 — Infrastructure: Deployment topology, Network architecture, CI/CD pipeline, Scaling strategy, DR, Monitoring

Required diagrams: C4 Context, C4 Container, Full ERD, Data flow, Deployment topology, CI/CD pipeline`,

    "api-docs": `SECTIONS (4 books):

BOOK 1 — Getting Started: What API does, Base URLs, Authentication, Rate limiting, Error format, Pagination
BOOK 2 — Endpoint Reference: For EVERY endpoint: Method|Path|Auth|Description, request/response schemas, curl example
BOOK 3 — Data Models: Type definitions, Enum values, Relationship diagram, Validation rules
BOOK 4 — Integration Guide: Webhooks, SDK examples, Common patterns, Testing, Migration guide

Every endpoint in table: Method | Path | Auth Required | Request Body | Response | Status Codes`,

    onboarding: `PHASES:

PHASE 0 — Prerequisites (~5 min): Tools with version checks, install commands per OS
PHASE 1 — Clone & First Run (~10 min): Git commands, env setup, first run, expected output
PHASE 2 — Understanding (~15 min): Architecture diagram, annotated file tree, key locations
PHASE 3 — First Change (~10 min): Add trivial feature, git workflow: branch > change > test > PR
PHASE 4 — Tests (~5 min): Every test command with expected output
PHASE 5 — Dev Workflow (~5 min): Hot reload, debugging, useful scripts

APPENDIX: Troubleshooting table (15+ rows), env vars, commands cheat sheet
Every command has expected output. Verification checkpoints after EVERY phase.`,

    "deep-dive": `SECTIONS for feature "${c.feature || "{{FEATURE}}"}":

1. Problem this solves (2-3 paragraphs)  2. Architecture diagram in isolation
3. Data structures/types with field docs  4. Step-by-step flow diagram
5. Annotated code walkthrough  6. State management  7. Edge cases
8. Error handling & recovery  9. Performance  10. Testing (unit + integration)
11. Extension/modification guide  12. Known limitations & future work`,

    security: `SECTIONS (4 books):

BOOK 1 — Authentication: Auth flow diagram, Token management, RBAC, Sessions, OAuth flows
BOOK 2 — Data Protection: Input validation, SQL injection, XSS, CSRF, Sensitive data, File upload security
BOOK 3 — Infrastructure Security: Secrets management, TLS, CORS, Rate limiting, Dependency scan, Container security
BOOK 4 — Compliance: OWASP Top 10 checklist, Security headers, Logging & audit trail, Incident response, Recommendations`,
  };

  const m = MODES.find(x => x.id === c.mode);
  return `${"=".repeat(63)}
CODEBASE ANALYSIS — ${m.label.toUpperCase()}
${"=".repeat(63)}

-- PROJECT CONTEXT --
Project Name:     ${c.name || "{{PROJECT_NAME}}"}
Repository:       ${c.url || "{{GITHUB_URL}}"}
Stack:            ${c.stack !== "Auto-detect" ? c.stack : "Auto-detect from codebase files"}
Target Reader:    ${c.audience || "Junior developers, CS students"}
${c.mode === "deep-dive" ? `Feature Focus:    ${c.feature || "{{FEATURE_NAME}}"}\n` : ""}${c.notes ? `Notes:            ${c.notes}\n` : ""}
-- WHAT TO BUILD --
Generate a COMPLETE, self-contained HTML file — a ${m.label.toLowerCase()} for this codebase.
- Single .html file (no external CSS/JS, only Google Fonts CDN)
- Opens in any browser — no build step
- Print-ready
- Every section complete — no placeholders or "rest here"

${sections[c.mode]}
${design}

-- CODEBASE INTELLIGENCE --
Before writing, silently analyze:
1. INVENTORY every file & its purpose
2. DETECT stack, frameworks, exact versions
3. MAP architecture: entry points, routing, middleware, models, services
4. TRACE a request end-to-end through every layer
5. IDENTIFY patterns: state mgmt, error handling, auth strategy
6. FIND all config: env vars, feature flags, build settings
7. ASSESS quality: tests, error handling, logging, security

-- HTML STRUCTURE --
<!DOCTYPE html><html lang="en"><head>
  <!-- Google Fonts: DM Serif Display, DM Sans, JetBrains Mono -->
  <style>/* Complete CSS per design system */</style>
</head><body>
  <!-- Cover page (full-viewport, navy gradient) -->
  <!-- Table of Contents -->
  <!-- All books/sections -->
  <!-- Appendix -->
  <!-- JS: progress bar, copy buttons, collapsible sections -->
</body></html>

-- DELIVERABLE --
Output ONE complete HTML file. Do NOT truncate or use placeholders.
Every section must be present and COMPLETE with real content.

${"=".repeat(63)}
CODEBASE FILES — ANALYZE BEFORE WRITING
${"=".repeat(63)}

${code || "{{PASTE YOUR CODEBASE FILES HERE}}"}`;
}

export default function App() {
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState("github");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [files, setFiles] = useState([]);
  const [contents, setContents] = useState({});
  const [mode, setMode] = useState("textbook");
  const [name, setName] = useState("");
  const [stack, setStack] = useState("Auto-detect");
  const [audience, setAudience] = useState("Junior developers & CS students");
  const [feature, setFeature] = useState("");
  const [notes, setNotes] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const validExts = ["js","jsx","ts","tsx","py","rb","go","rs","java","dart","json","yaml","yml","md","txt","sql","css","html","vue","svelte","php","swift","kt","sh","toml","cfg","ini","env","xml","graphql","proto"];
  const extColors = { js:"#f7df1e",ts:"#3178c6",jsx:"#61dafb",tsx:"#3178c6",py:"#3776ab",rb:"#cc342d",go:"#00add8",rs:"#dea584",java:"#ed8b00",dart:"#0175c2",json:"#8bc34a",yaml:"#cb171e",yml:"#cb171e",md:"#555",sql:"#e48900",css:"#264de4",html:"#e34c26",vue:"#42b883",svelte:"#ff3e00",php:"#777bb3",swift:"#fa7343" };

  const handleFiles = useCallback((fl) => {
    Array.from(fl).forEach(f => {
      const ext = f.name.split(".").pop().toLowerCase();
      const isValid = validExts.includes(ext) || f.name.endsWith(".zip") || ["makefile","dockerfile","procfile","readme"].some(n => f.name.toLowerCase().includes(n));
      if (!isValid) return;
      const reader = new FileReader();
      reader.onload = e => {
        setFiles(p => [...p, { name: f.name, size: f.size }]);
        setContents(p => ({ ...p, [f.name]: f.name.endsWith(".zip") ? `[ZIP: ${f.name} - ${(f.size/1024).toFixed(1)}KB]` : e.target.result }));
      };
      f.name.endsWith(".zip") ? reader.readAsArrayBuffer(f) : reader.readAsText(f);
    });
  }, []);

  const removeFile = n => {
    setFiles(p => p.filter(f => f.name !== n));
    setContents(p => { const x = { ...p }; delete x[n]; return x; });
  };

  const getCode = () => {
    if (tab === "paste") return paste;
    if (tab === "upload") return Object.entries(contents).map(([n, c]) => `---- FILE: ${n} ----\n${c}`).join("\n\n");
    return paste || "";
  };

  const generate = () => {
    setPrompt(buildPrompt({ mode, name, url, stack, audience, feature, notes }, getCode()));
    setStep(2);
  };

  const copyText = async (t) => {
    try { await navigator.clipboard.writeText(t); } catch {
      const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); document.body.removeChild(a);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendAPI = async () => {
    setLoading(true); setError(""); setOutput(""); setStep(3);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 16000, messages: [{ role: "user", content: prompt }] })
      });
      if (!r.ok) throw new Error("API error " + r.status);
      const d = await r.json();
      setOutput(d.content?.map(c => c.text || "").join("") || "No output received");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const reset = () => { setStep(0); setOutput(""); setPrompt(""); setError(""); setLoading(false); };
  const canNext = tab === "github" ? url.trim().length > 0 : tab === "upload" ? files.length > 0 : paste.trim().length > 0;

  // Common style helpers
  const mkInput = (v, set, ph, extra) => (
    <input value={v} onChange={e => set(e.target.value)} placeholder={ph}
      style={{ width:"100%", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", fontSize:14, color:"#fff", outline:"none", ...extra }} />
  );

  const mkSelect = (v, set, opts) => (
    <select value={v} onChange={e => set(e.target.value)}
      style={{ width:"100%", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", fontSize:14, color:"#fff", outline:"none" }}>
      {opts.map(o => <option key={o} value={o} style={{ background:"#1a1a2e" }}>{o}</option>)}
    </select>
  );

  const Label = ({ children }) => (
    <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.45)", marginBottom:8, letterSpacing:"0.1em", textTransform:"uppercase" }}>{children}</div>
  );

  const Btn = ({ children, onClick, active, style: s }) => (
    <button onClick={onClick} disabled={active === false}
      style={{ background: active !== false ? "linear-gradient(135deg,#d4a574,#c08840)" : "rgba(255,255,255,0.05)", border:"none", color: active !== false ? "#08080d" : "rgba(255,255,255,0.25)", padding:"13px 28px", borderRadius:11, fontSize:14, fontWeight:700, cursor: active !== false ? "pointer" : "not-allowed", letterSpacing:"0.02em", ...s }}>
      {children}
    </button>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#08080d", color:"#e8e4dc", fontFamily:"system-ui,-apple-system,sans-serif", position:"relative", overflow:"hidden" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes barPulse { 0%,100%{transform:scaleY(0.5);opacity:0.3} 50%{transform:scaleY(1);opacity:1} }
        *{box-sizing:border-box;margin:0;padding:0}
        input,textarea,select,button{font-family:inherit}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
        ::selection{background:rgba(212,165,116,0.3)}
      `}</style>

      {/* Ambient glows */}
      {[["#d4a574","-5%","8%",280],["#0d9488","35%","78%",220],["#3b82f6","72%","18%",180]].map(([c,t,l,s],i) => (
        <div key={i} style={{ position:"absolute", top:t, left:l, width:s, height:s, borderRadius:"50%", background:c, filter:`blur(${s*0.6}px)`, opacity:0.1, pointerEvents:"none" }} />
      ))}

      {/* NAV */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"rgba(8,8,13,0.88)", backdropFilter:"blur(20px)", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between", height:54 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ color:"#d4a574", fontSize:18, fontWeight:800 }}>⬡</span>
          <span style={{ fontWeight:700, fontSize:14, color:"#fff" }}>Codebase Explainer</span>
          <span style={{ fontSize:10, fontWeight:600, color:"#d4a574", background:"rgba(212,165,116,0.1)", border:"1px solid rgba(212,165,116,0.2)", padding:"2px 8px", borderRadius:100 }}>v3.0</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          {["Input","Configure","Prompt","Output"].map((l, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, background:i<=step?"rgba(212,165,116,0.15)":"rgba(255,255,255,0.04)", color:i<=step?"#d4a574":"rgba(255,255,255,0.2)", border:`1px solid ${i<=step?"rgba(212,165,116,0.3)":"rgba(255,255,255,0.06)"}` }}>
                {i < step ? "✓" : i + 1}
              </div>
              <span style={{ fontSize:11, fontWeight:500, color:i<=step?"rgba(255,255,255,0.6)":"rgba(255,255,255,0.15)" }}>{l}</span>
              {i < 3 && <div style={{ width:16, height:1, background:i<step?"rgba(212,165,116,0.3)":"rgba(255,255,255,0.05)" }} />}
            </div>
          ))}
        </div>
        {step > 0 && (
          <button onClick={reset} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", padding:"6px 14px", borderRadius:8, fontSize:12, cursor:"pointer" }}>
            Start Over
          </button>
        )}
      </div>

      {/* STEP 0: INPUT */}
      {step === 0 && (
        <div style={{ maxWidth:860, margin:"0 auto", padding:"52px 28px 80px", animation:"fadeUp 0.45s ease" }}>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.25em", textTransform:"uppercase", color:"#d4a574", marginBottom:18, textAlign:"center" }}>
            UNDERSTAND ANY CODEBASE IN MINUTES
          </div>
          <h1 style={{ fontSize:"clamp(1.8rem,4.5vw,2.8rem)", fontWeight:800, color:"#fff", lineHeight:1.12, letterSpacing:"-0.03em", marginBottom:14, textAlign:"center" }}>
            Turn any repository into a<br />
            <span style={{ fontStyle:"italic", fontWeight:300, background:"linear-gradient(90deg,#f0c070,#5eead4)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              beautiful, teachable book
            </span>
          </h1>
          <p style={{ fontSize:15, color:"rgba(255,255,255,0.4)", maxWidth:520, margin:"0 auto 44px", lineHeight:1.7, textAlign:"center" }}>
            Feed in a GitHub repo, upload files, or paste code — get a complete engineering textbook, API reference, onboarding guide, or security audit.
          </p>

          {/* Tabs */}
          <div style={{ display:"flex", gap:8, marginBottom:24, justifyContent:"center" }}>
            {[["github","⬡","GitHub URL"],["upload","↑","Upload Files"],["paste","⌨","Paste Code"]].map(([id, icon, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ background:tab===id?"rgba(212,165,116,0.12)":"rgba(255,255,255,0.03)", border:`1px solid ${tab===id?"rgba(212,165,116,0.3)":"rgba(255,255,255,0.06)"}`, color:tab===id?"#d4a574":"rgba(255,255,255,0.4)", padding:"10px 20px", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:15 }}>{icon}</span>{label}
              </button>
            ))}
          </div>

          {/* Input area */}
          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:24, minHeight:200 }}>
            {tab === "github" && (
              <div>
                <Label>Repository URL</Label>
                {mkInput(url, setUrl, "https://github.com/username/repository", { fontFamily:"monospace" })}
                <div style={{ marginTop:18, padding:"14px 18px", background:"rgba(13,148,136,0.06)", border:"1px solid rgba(13,148,136,0.15)", borderRadius:10, display:"flex", gap:10, fontSize:13, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>
                  <span>💡</span>
                  <div><strong style={{ color:"#5eead4" }}>Tip:</strong> For best results, also paste key files below — entry points, models, routes, config, types.</div>
                </div>
                <div style={{ marginTop:16 }}>
                  <Label>Supplementary Code (optional)</Label>
                  <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder="Paste key files here for richer analysis..."
                    style={{ width:"100%", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"14px 16px", fontSize:13, color:"rgba(255,255,255,0.7)", outline:"none", resize:"vertical", fontFamily:"monospace", lineHeight:1.6, minHeight:100 }} />
                </div>
              </div>
            )}

            {tab === "upload" && (
              <div>
                <div onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                  style={{ border:`2px dashed ${dragOver?"rgba(212,165,116,0.5)":"rgba(255,255,255,0.1)"}`, borderRadius:13, padding:"40px 20px", textAlign:"center", cursor:"pointer", background:dragOver?"rgba(212,165,116,0.04)":"transparent" }}>
                  <input type="file" ref={fileRef} multiple onChange={e => handleFiles(e.target.files)} style={{ display:"none" }} />
                  <div style={{ fontSize:32, marginBottom:10, opacity:0.4 }}>↑</div>
                  <div style={{ fontSize:14, fontWeight:600, color:"rgba(255,255,255,0.5)", marginBottom:4 }}>Drop files here or click to browse</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.25)" }}>.js .ts .py .go .rs .java .json .yaml .sql .md .zip and 25+ more</div>
                </div>
                {files.length > 0 && (
                  <div style={{ marginTop:16 }}>
                    <Label>{files.length} file{files.length > 1 ? "s" : ""} loaded</Label>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      {files.map(f => (
                        <div key={f.name} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"8px 12px" }}>
                          <div style={{ width:7, height:7, borderRadius:"50%", background:extColors[f.name.split(".").pop()] || "#888", flexShrink:0 }} />
                          <span style={{ flex:1, color:"rgba(255,255,255,0.7)", fontFamily:"monospace", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                          <span style={{ color:"rgba(255,255,255,0.25)", fontSize:10 }}>{(f.size / 1024).toFixed(1)}K</span>
                          <button onClick={() => removeFile(f.name)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.25)", cursor:"pointer", fontSize:14, lineHeight:1 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "paste" && (
              <div>
                <Label>Paste your codebase files</Label>
                <textarea value={paste} onChange={e => setPaste(e.target.value)}
                  placeholder={"Paste code files separated like:\n\n---- FILE: src/app.ts ----\nimport express from 'express';\n...\n\n---- FILE: src/models/user.ts ----\nexport interface User { ... }"}
                  style={{ width:"100%", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"16px", fontSize:13, color:"#e6edf3", outline:"none", resize:"vertical", fontFamily:"monospace", lineHeight:1.65, minHeight:280 }} />
                <div style={{ marginTop:6, fontSize:11, color:"rgba(255,255,255,0.2)", textAlign:"right" }}>
                  {paste.length.toLocaleString()} chars · ~{Math.ceil(paste.length / 4).toLocaleString()} tokens
                </div>
              </div>
            )}
          </div>

          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:22 }}>
            <Btn onClick={() => setStep(1)} active={canNext}>Configure Analysis →</Btn>
          </div>
        </div>
      )}

      {/* STEP 1: CONFIGURE */}
      {step === 1 && (
        <div style={{ maxWidth:880, margin:"0 auto", padding:"48px 28px 80px", animation:"fadeUp 0.45s ease" }}>
          <h2 style={{ fontSize:24, fontWeight:700, color:"#fff", marginBottom:8 }}>Configure your analysis</h2>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.4)", marginBottom:36 }}>Choose documentation type and customize for your audience.</p>

          <div style={{ marginBottom:32 }}>
            <Label>Analysis Mode</Label>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:9, marginTop:4 }}>
              {MODES.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  style={{ background:mode===m.id?"rgba(212,165,116,0.08)":"rgba(255,255,255,0.02)", border:`1px solid ${mode===m.id?"rgba(212,165,116,0.3)":"rgba(255,255,255,0.06)"}`, borderRadius:13, padding:"16px 14px", textAlign:"left", cursor:"pointer" }}>
                  <div style={{ fontSize:22, marginBottom:8 }}>{m.icon}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:mode===m.id?"#d4a574":"rgba(255,255,255,0.65)", marginBottom:5 }}>{m.label}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", lineHeight:1.45, marginBottom:8 }}>{m.desc}</div>
                  <span style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.04)", padding:"2px 8px", borderRadius:100 }}>{m.meta}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
            <div><Label>Project Name</Label>{mkInput(name, setName, "e.g., VitalTrack")}</div>
            <div><Label>Tech Stack</Label>{mkSelect(stack, setStack, STACKS)}</div>
            <div><Label>Target Audience</Label>{mkSelect(audience, setAudience, AUDIENCES)}</div>
            {mode === "deep-dive" && <div><Label>Feature / Module</Label>{mkInput(feature, setFeature, "e.g., Offline Sync Engine")}</div>}
          </div>

          <div style={{ marginBottom:28 }}>
            <Label>Additional Notes (optional)</Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Specific areas to focus on, things to skip..."
              style={{ width:"100%", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 16px", fontSize:14, color:"rgba(255,255,255,0.7)", outline:"none", resize:"vertical", minHeight:60 }} />
          </div>

          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button onClick={() => setStep(0)} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", padding:"11px 22px", borderRadius:10, fontSize:13, cursor:"pointer" }}>← Back</button>
            <Btn onClick={generate}>Generate Prompt →</Btn>
          </div>
        </div>
      )}

      {/* STEP 2: PROMPT READY */}
      {step === 2 && (
        <div style={{ maxWidth:880, margin:"0 auto", padding:"48px 28px 80px", animation:"fadeUp 0.45s ease" }}>
          <h2 style={{ fontSize:24, fontWeight:700, color:"#fff", marginBottom:8 }}>Your prompt is ready</h2>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.4)", marginBottom:28 }}>Copy and paste into Claude, or send directly via the API.</p>

          <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
            <button onClick={() => copyText(prompt)}
              style={{ background:copied?"rgba(34,197,94,0.15)":"linear-gradient(135deg,#d4a574,#c08840)", border:copied?"1px solid rgba(34,197,94,0.3)":"none", color:copied?"#22c55e":"#08080d", padding:"12px 24px", borderRadius:11, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {copied ? "✓ Copied!" : "Copy Full Prompt"}
            </button>
            <button onClick={sendAPI}
              style={{ background:"rgba(59,130,246,0.12)", border:"1px solid rgba(59,130,246,0.3)", color:"#60a5fa", padding:"12px 24px", borderRadius:11, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              ⚡ Send to Claude API
            </button>
            <button onClick={() => setShowPreview(!showPreview)}
              style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", padding:"12px 18px", borderRadius:10, fontSize:13, cursor:"pointer" }}>
              {showPreview ? "Hide" : "Preview"} Prompt
            </button>
          </div>

          <div style={{ display:"flex", gap:18, marginBottom:22, padding:"12px 18px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10 }}>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}><span style={{ color:"#d4a574", fontWeight:700 }}>{prompt.length.toLocaleString()}</span> chars</span>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}><span style={{ color:"#5eead4", fontWeight:700 }}>~{Math.ceil(prompt.length / 4).toLocaleString()}</span> tokens</span>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Mode: <strong style={{ color:"#fff" }}>{MODES.find(m => m.id === mode)?.label}</strong></span>
          </div>

          {showPreview && (
            <div style={{ background:"#0d1117", border:"1px solid rgba(212,165,116,0.2)", borderRadius:13, overflow:"hidden", marginBottom:22 }}>
              <div style={{ background:"#161b22", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #30363d" }}>
                <div style={{ display:"flex", gap:5 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:"#ff5f57" }} />
                  <div style={{ width:9, height:9, borderRadius:"50%", background:"#febc2e" }} />
                  <div style={{ width:9, height:9, borderRadius:"50%", background:"#28c840" }} />
                </div>
                <span style={{ fontFamily:"monospace", fontSize:10, color:"#8b949e", letterSpacing:"0.1em", textTransform:"uppercase" }}>Generated Prompt</span>
              </div>
              <pre style={{ padding:20, fontSize:12, fontFamily:"monospace", color:"#e6edf3", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:450, overflowY:"auto", margin:0 }}>
                {prompt}
              </pre>
            </div>
          )}

          <div style={{ marginTop:18, padding:"14px 18px", background:"rgba(13,148,136,0.06)", border:"1px solid rgba(13,148,136,0.15)", borderRadius:10, display:"flex", gap:10, fontSize:13, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>
            <span>💡</span>
            <div>
              <strong style={{ color:"rgba(255,255,255,0.65)" }}>Copy & Paste:</strong> Paste into Claude.ai with files attached.{" "}
              <strong style={{ color:"rgba(255,255,255,0.65)" }}>API:</strong> Send directly to generate.{" "}
              <strong style={{ color:"rgba(255,255,255,0.65)" }}>Claude Code:</strong> Run <code style={{ background:"rgba(0,0,0,0.3)", padding:"1px 5px", borderRadius:3, fontSize:11 }}>claude</code> in your project dir and paste.
            </div>
          </div>

          <div style={{ marginTop:22 }}>
            <button onClick={() => setStep(1)} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", padding:"11px 22px", borderRadius:10, fontSize:13, cursor:"pointer" }}>← Back</button>
          </div>
        </div>
      )}

      {/* STEP 3: OUTPUT */}
      {step === 3 && (
        <div style={{ maxWidth:920, margin:"0 auto", padding:"48px 28px 80px", animation:"fadeUp 0.45s ease" }}>
          {loading && (
            <div style={{ textAlign:"center", padding:"70px 0" }}>
              <div style={{ display:"flex", justifyContent:"center", gap:4, marginBottom:22, height:36, alignItems:"flex-end" }}>
                {[0,1,2,3,4].map(i => <div key={i} style={{ width:4, height:22, background:"#d4a574", borderRadius:2, animation:"barPulse 1.2s ease-in-out infinite", animationDelay:`${i * 0.15}s` }} />)}
              </div>
              <div style={{ fontSize:20, fontWeight:700, color:"#fff", marginBottom:8 }}>Analyzing your codebase...</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)" }}>Reading files, tracing data flows, composing documentation. 30–90 seconds.</div>
            </div>
          )}

          {error && (
            <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:11, padding:"18px 22px", marginBottom:22 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#ef4444", marginBottom:5 }}>Error</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:12 }}>{error}</div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={sendAPI} style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", color:"#ef4444", padding:"7px 14px", borderRadius:8, fontSize:12, cursor:"pointer", fontWeight:600 }}>Retry</button>
                <button onClick={() => setStep(2)} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", padding:"7px 14px", borderRadius:8, fontSize:12, cursor:"pointer" }}>Back to Prompt</button>
              </div>
            </div>
          )}

          {output && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                <h2 style={{ fontSize:22, fontWeight:700, color:"#fff" }}>Documentation Generated ✓</h2>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => copyText(output)} style={{ background:"rgba(212,165,116,0.12)", border:"1px solid rgba(212,165,116,0.3)", color:"#d4a574", padding:"7px 14px", borderRadius:8, fontSize:12, cursor:"pointer", fontWeight:600 }}>
                    {copied ? "✓ Copied" : "Copy HTML"}
                  </button>
                  <button onClick={() => {
                    const b = new Blob([output], { type:"text/html" });
                    const u = URL.createObjectURL(b);
                    const a = document.createElement("a");
                    a.href = u; a.download = `${name || "codebase"}-docs.html`; a.click();
                    URL.revokeObjectURL(u);
                  }} style={{ background:"rgba(34,197,94,0.12)", border:"1px solid rgba(34,197,94,0.3)", color:"#22c55e", padding:"7px 14px", borderRadius:8, fontSize:12, cursor:"pointer", fontWeight:600 }}>
                    ↓ Download .html
                  </button>
                </div>
              </div>

              <div style={{ background:"#0d1117", border:"1px solid rgba(255,255,255,0.08)", borderRadius:13, overflow:"hidden" }}>
                <div style={{ background:"#161b22", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #30363d" }}>
                  <div style={{ display:"flex", gap:5 }}>
                    <div style={{ width:9, height:9, borderRadius:"50%", background:"#ff5f57" }} />
                    <div style={{ width:9, height:9, borderRadius:"50%", background:"#febc2e" }} />
                    <div style={{ width:9, height:9, borderRadius:"50%", background:"#28c840" }} />
                  </div>
                  <span style={{ fontFamily:"monospace", fontSize:10, color:"#8b949e", textTransform:"uppercase", letterSpacing:"0.1em" }}>Output</span>
                </div>
                <pre style={{ padding:20, fontSize:12, fontFamily:"monospace", color:"#e6edf3", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:500, overflowY:"auto", margin:0 }}>
                  {output}
                </pre>
              </div>

              <div style={{ marginTop:18, padding:"14px 18px", background:"rgba(212,165,116,0.06)", border:"1px solid rgba(212,165,116,0.15)", borderRadius:10, display:"flex", gap:10, fontSize:13, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>
                <span>⚠️</span>
                <div><strong style={{ color:"#d4a574" }}>Truncated?</strong> Follow up: <em style={{ color:"rgba(255,255,255,0.55)" }}>"The file was cut off after [last section]. Continue from exactly where it stopped."</em></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ borderTop:"1px solid rgba(255,255,255,0.04)", padding:"28px 32px", textAlign:"center" }}>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.15)" }}>
          <strong style={{ color:"rgba(255,255,255,0.3)" }}>Codebase Explainer v3.0</strong> · Any project · Any stack · Any language
        </span>
      </div>
    </div>
  );
}
