"use client";

import {
  Activity, BookOpen, Bot, ChevronDown, CircleStop, FileText, Gauge, Menu,
  MessageSquarePlus, PanelRightClose, PanelRightOpen, Send, Trash2, Upload, Wrench, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelConfig, ProviderId, Usage } from "@/contracts/ai";

type Conversation = { id: string; title: string; provider: ProviderId; model: string; updated_at?: string };
type Message = { id: string; role: "user" | "assistant"; content: string };
type Collection = { id: string; name: string; document_count: number; chunk_count: number };
type RetrievalMode = "vector" | "hybrid";
type RetrievedChunk = { id: string; documentName: string; content: string; score: number; chunkIndex: number; retrievalMode: RetrievalMode };
type RequestMetric = {
  id: string; provider: string; model: string; started_at: string; first_token_ms: number | null; total_ms: number;
  input_tokens: number; output_tokens: number; cached_tokens: number; reasoning_tokens: number; cost_usd: number;
  finish_reason: string; retry_count: number; fallback_from?: string;
};
type AggregateMetric = { provider: string; requests: number; spend: number; average_latency_ms: number; average_ttft_ms: number };
type StreamMetric = { firstTokenMs: number | null; totalMs: number; usage: Usage; costUsd: number; retries: number };
type ProviderSummary = { id: ProviderId; label: string; available: boolean };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Request failed");
  return response.json();
}

export function Workbench() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [mobileNav, setMobileNav] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [tab, setTab] = useState<"documents" | "metrics">("documents");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(150);
  const [topK, setTopK] = useState(4);
  const [threshold, setThreshold] = useState(0.15);
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("hybrid");
  const [uploading, setUploading] = useState(false);
  const [retrieved, setRetrieved] = useState<RetrievedChunk[]>([]);
  const [recentMetrics, setRecentMetrics] = useState<RequestMetric[]>([]);
  const [aggregateMetrics, setAggregateMetrics] = useState<AggregateMetric[]>([]);
  const [liveMetric, setLiveMetric] = useState<StreamMetric | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const initializedRef = useRef(false);

  const availableModels = useMemo(() => models.filter((item) => item.provider === provider), [models, provider]);
  const selectedModel = availableModels.find((item) => item.id === model);
  const providerLabel = useCallback((id: ProviderId) => providers.find((item) => item.id === id)?.label ?? id, [providers]);

  const refreshConversations = useCallback(async () => {
    const data = await json<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(data.conversations);
    return data.conversations;
  }, []);

  const refreshCollections = useCallback(async () => {
    const data = await json<{ collections: Collection[] }>("/api/documents");
    setCollections(data.collections);
    if (!collectionId && data.collections[0]) setCollectionId(data.collections[0].id);
  }, [collectionId]);

  const refreshMetrics = useCallback(async () => {
    const data = await json<{ recent: RequestMetric[]; aggregate: AggregateMetric[] }>("/api/metrics");
    setRecentMetrics(data.recent);
    setAggregateMetrics(data.aggregate);
  }, []);

  const createConversation = useCallback(async (chosenProvider: ProviderId = provider) => {
    const data = await json<Conversation>("/api/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: chosenProvider }),
    });
    setConversations((current) => [data, ...current]);
    setActiveId(data.id);
    setMessages([]);
    setProvider(data.provider);
    setModel(data.model);
    setRetrieved([]);
    setMobileNav(false);
  }, [provider]);

  const loadConversation = useCallback(async (id: string) => {
    const data = await json<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`);
    stickToBottomRef.current = true;
    setActiveId(id);
    setMessages(data.messages);
    setProvider(data.conversation.provider);
    setModel(data.conversation.model);
    setRetrieved([]);
    setMobileNav(false);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      try {
        const [config, list] = await Promise.all([
          json<{ models: ModelConfig[]; providers: ProviderSummary[] }>("/api/config"),
          refreshConversations(), refreshCollections(), refreshMetrics(),
        ]);
        setModels(config.models);
        setProviders(config.providers);
        if (list.length) await loadConversation(list[0].id);
        else await createConversation(config.providers.find((item) => item.available)?.id ?? config.providers[0].id);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load workbench");
      }
    })();
    // The bootstrap intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: streaming ? "instant" : "smooth" });
    }
  }, [messages, streaming]);

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    const remaining = conversations.filter((item) => item.id !== id);
    setConversations(remaining);
    if (activeId === id) {
      if (remaining[0]) await loadConversation(remaining[0].id);
      else await createConversation();
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || !activeId || streaming || !model) return;
    stickToBottomRef.current = true;
    setInput(""); setRetrieved([]); setLiveMetric(null);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content }, { id: "stream", role: "assistant", content: "" }]);
    setStreaming(true); setStatus("Connecting");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, provider, model, message: content, collectionId: collectionId || undefined, topK, threshold, retrievalMode }),
      });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error ?? "Chat request failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5));
          if (event.type === "text") {
            assistantText += event.text;
            setMessages((current) => current.map((item) => item.id === "stream" ? { ...item, content: assistantText } : item));
            setStatus("Streaming");
          }
          if (event.type === "tool") {
            setStatus(event.status === "calling" ? `Calling ${event.name}` : `${event.name} complete`);
            if (event.status === "complete" && event.name === "search_documents") setRetrieved(event.result?.chunks ?? []);
          }
          if (event.type === "retrieval") setRetrieved(event.chunks ?? []);
          if (event.type === "notice") setStatus(event.message);
          if (event.type === "fallback") setStatus(`Fallback: ${providerLabel(event.to)}`);
          if (event.type === "metrics") setLiveMetric(event);
          if (event.type === "error") throw new Error(event.error.message);
        }
        if (done) break;
      }
      setMessages((current) => current.map((item) => item.id === "stream" ? { ...item, id: crypto.randomUUID() } : item));
      setStatus("Complete");
      await Promise.all([refreshConversations(), refreshMetrics()]);
    } catch (error) {
      const cancelled = controller.signal.aborted;
      setStatus(cancelled ? "Cancelled" : error instanceof Error ? error.message : "Request failed");
      setMessages((current) => current.map((item) => item.id === "stream" && !item.content ? { ...item, content: cancelled ? "Request cancelled." : "The request failed." } : item));
    } finally {
      setStreaming(false); abortRef.current = null;
    }
  }

  async function uploadDocuments(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;
    setUploading(true); setStatus("Indexing documents");
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.set("chunkSize", String(chunkSize)); form.set("overlap", String(overlap));
    form.set("collectionName", files[0].name.replace(/\.[^.]+$/, ""));
    if (collectionId) form.set("collectionId", collectionId);
    try {
      const result = await json<{ collectionId: string; chunks: number }>("/api/documents", { method: "POST", body: form });
      setCollectionId(result.collectionId); setStatus(`Indexed ${result.chunks} chunks`); await refreshCollections();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false); event.target.value = "";
    }
  }

  const selectedCollection = collections.find((item) => item.id === collectionId);

  return (
    <main className="workbench-shell">
      <aside className={`conversation-rail ${mobileNav ? "open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Bot size={18} /></div>
          <div><strong>Polyglot</strong><span>AI workbench</span></div>
          <button className="icon-button mobile-only" onClick={() => setMobileNav(false)} title="Close navigation"><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={() => void createConversation()}><MessageSquarePlus size={17} /> New conversation</button>
        <div className="rail-label">Conversations</div>
        <nav className="conversation-list">
          {conversations.map((conversation) => (
            <div className={`conversation-item ${conversation.id === activeId ? "active" : ""}`} key={conversation.id}>
              <button onClick={() => void loadConversation(conversation.id)}><span>{conversation.title}</span><small>{providerLabel(conversation.provider)}</small></button>
              <button className="delete-button" onClick={() => void deleteConversation(conversation.id)} title="Delete conversation"><Trash2 size={14} /></button>
            </div>
          ))}
        </nav>
        <div className="provider-health">
          <div className="rail-label">API keys</div>
          {providers.map((item) => (
            <div key={item.id}><span className={`status-dot ${item.available ? "online" : ""}`} />{item.label}<small>{item.available ? "ready" : "missing"}</small></div>
          ))}
        </div>
      </aside>

      <section className="chat-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} title="Open navigation"><Menu size={19} /></button>
          <label className="select-field"><span>Provider</span><select value={provider} onChange={(event) => { const nextProvider = event.target.value; setProvider(nextProvider); setModel(models.find((item) => item.provider === nextProvider)?.id ?? ""); }}>{providers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><ChevronDown size={14} /></label>
          <label className="select-field model-field"><span>Model</span><select value={model} onChange={(event) => setModel(event.target.value)}>{availableModels.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><ChevronDown size={14} /></label>
          <div className="topbar-spacer" />
          <span className="request-status"><span className={`status-dot ${streaming ? "busy" : "online"}`} />{status}</span>
          <button className="icon-button" onClick={() => setInspectorOpen((current) => !current)} title={inspectorOpen ? "Close inspector" : "Open inspector"}>{inspectorOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}</button>
        </header>

        <div
          className="message-scroll"
          ref={messageScrollRef}
          onScroll={() => {
            const element = messageScrollRef.current;
            if (element) stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          {!messages.length ? (
            <div className="empty-state">
              <Bot size={26} /><h1>What are we working on?</h1><p>Choose a provider, attach reference documents if needed, and start a conversation.</p>
              <div className="prompt-row"><button onClick={() => setInput("Compare the strengths of the available providers for this task.")}>Compare providers</button><button onClick={() => setInput("Use the calculator to evaluate (84 / 7) * 13.")}>Test a tool call</button><button onClick={() => setInput("Search the selected documents and summarize the key points with citations.")}>Query documents</button></div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className="message-author">{message.role === "user" ? "You" : providerLabel(provider)}</div><div className="message-body"><ReactMarkdown>{message.content || "..."}</ReactMarkdown></div></article>)}
              {retrieved.length > 0 && <div className="citation-strip"><BookOpen size={15} /> Retrieved {retrieved.length} supporting chunks. Open Documents to inspect them.</div>}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="composer-zone"><div className="composer">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Message Polyglot" rows={2} disabled={streaming} />
          <div className="composer-actions"><span>{selectedModel ? `${(selectedModel.contextWindow / 1000).toFixed(0)}k context` : ""}</span>{streaming ? <button className="send-button stop" onClick={() => abortRef.current?.abort()} title="Stop generation"><CircleStop size={18} /></button> : <button className="send-button" onClick={() => void sendMessage()} disabled={!input.trim()} title="Send message"><Send size={18} /></button>}</div>
        </div></div>
      </section>

      {inspectorOpen && <aside className="inspector">
        <div className="inspector-tabs"><button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}><FileText size={16} />Documents</button><button className={tab === "metrics" ? "active" : ""} onClick={() => setTab("metrics")}><Activity size={16} />Metrics</button></div>
        {tab === "documents" ? <div className="inspector-content">
          <section className="panel-section"><div className="section-heading"><div><h2>Knowledge base</h2><p>PDF, TXT, or Markdown</p></div><label className={`upload-button ${uploading ? "disabled" : ""}`}><Upload size={15} />{uploading ? "Indexing" : "Upload"}<input type="file" multiple accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf" onChange={(event) => void uploadDocuments(event)} disabled={uploading} /></label></div>
            <label className="control-label">Collection<select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">No collection</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label>
            {selectedCollection && <div className="collection-summary"><FileText size={16} /><span>{selectedCollection.document_count} files</span><span>{selectedCollection.chunk_count} chunks</span></div>}
          </section>
          <section className="panel-section"><h2>Retrieval controls</h2><div className="mode-switch" role="group" aria-label="Retrieval mode"><button className={retrievalMode === "vector" ? "active" : ""} onClick={() => setRetrievalMode("vector")}>Vector</button><button className={retrievalMode === "hybrid" ? "active" : ""} onClick={() => setRetrievalMode("hybrid")}>Hybrid</button></div><div className="control-grid"><label>Chunk size<input type="number" min="200" max="4000" step="100" value={chunkSize} onChange={(event) => setChunkSize(Number(event.target.value))} /></label><label>Overlap<input type="number" min="0" max="2000" step="25" value={overlap} onChange={(event) => setOverlap(Number(event.target.value))} /></label><label>Top K<input type="number" min="1" max="12" value={topK} onChange={(event) => setTopK(Number(event.target.value))} /></label><label>Threshold<input type="number" min="-1" max="1" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label></div></section>
          <section className="panel-section retrieved-section"><h2>Retrieved chunks <span>{retrieved.length}</span></h2>{!retrieved.length ? <p className="quiet-copy">Relevant source text will appear here after a document search.</p> : retrieved.map((chunk) => <article className="chunk" key={chunk.id}><header><span>{chunk.documentName} · #{chunk.chunkIndex + 1}</span><strong>{chunk.retrievalMode === "hybrid" ? "Hybrid" : "Vector"} {Math.round(chunk.score * 100)}%</strong></header><p>{chunk.content}</p><code>{chunk.id}</code></article>)}</section>
        </div> : <div className="inspector-content">
          <section className="metric-summary"><div><Gauge size={16} /><span>Last request</span><strong>{liveMetric ? `${liveMetric.totalMs} ms` : "--"}</strong></div><div><Activity size={16} /><span>First token</span><strong>{liveMetric?.firstTokenMs != null ? `${liveMetric.firstTokenMs} ms` : "--"}</strong></div><div><Wrench size={16} /><span>Retries</span><strong>{liveMetric?.retries ?? 0}</strong></div><div><span className="dollar">$</span><span>Cost</span><strong>{liveMetric ? `$${liveMetric.costUsd.toFixed(6)}` : "--"}</strong></div></section>
          <section className="panel-section"><h2>Provider totals</h2><div className="provider-table">{aggregateMetrics.length ? aggregateMetrics.map((row) => <div key={row.provider}><strong>{providerLabel(row.provider)}</strong><span>{row.requests} req</span><span>{row.average_latency_ms ?? 0} ms</span><span>${Number(row.spend ?? 0).toFixed(4)}</span></div>) : <p className="quiet-copy">No completed requests yet.</p>}</div></section>
          <section className="panel-section"><h2>Recent requests</h2><div className="request-list">{recentMetrics.map((metric) => <article key={metric.id}><header><strong>{providerLabel(metric.provider)}</strong><span>{new Date(metric.started_at).toLocaleTimeString()}</span></header><p>{metric.model} · {metric.finish_reason}{metric.fallback_from ? ` · fallback from ${providerLabel(metric.fallback_from)}` : ""}</p><footer><span>TTFT {metric.first_token_ms ?? "--"} ms · total {metric.total_ms} ms · {metric.input_tokens} in / {metric.output_tokens} out · {metric.cached_tokens} cached / {metric.reasoning_tokens} reasoning · {metric.retry_count} retries</span><span>${Number(metric.cost_usd).toFixed(6)}</span></footer></article>)}</div></section>
        </div>}
      </aside>}
    </main>
  );
}
