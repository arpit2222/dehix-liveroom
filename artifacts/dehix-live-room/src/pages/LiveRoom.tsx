import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { io, type Socket } from "socket.io-client";
import {
  collection, addDoc, onSnapshot, orderBy, query as fsQuery, serverTimestamp
} from "firebase/firestore";
import { db, isFirebaseEnabled } from "@/lib/firebase";
import {
  useGetRoom, useGetRoomTickets, useGetRoomMilestones, useGetRoomNda,
  useCreateTicket, useUpdateTicket, useCreateMilestone, useSignNda, useGenerateNda,
  useAssembleSquad,
  getGetRoomQueryKey, getGetRoomTicketsQueryKey, getGetRoomMilestonesQueryKey, getGetRoomNdaQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { DocModal } from "@/components/DocModal";
import { toast } from "sonner";

type TabKey = "brief" | "tickets" | "milestones" | "nda" | "activity";

const ACTIVITY_LABELS: Record<string, string> = {
  room_created: "Room created",
  status_changed: "Status changed",
  participant_joined: "Participant joined",
  participant_invited: "Participant invited",
  participant_removed: "Participant removed",
  brief_generated: "AI brief generated",
  nda_generated: "NDA generated",
  nda_signed: "NDA signed",
  milestone_created: "Milestone added",
  milestone_released: "Milestone released",
  milestone_submitted: "Milestone submitted",
  ticket_created: "Ticket created",
  notes_updated: "Notes updated",
  room_contracted: "Room contracted",
  room_closed: "Room closed",
};

const ACTIVITY_ICONS: Record<string, string> = {
  room_created: "🏠",
  status_changed: "⚡",
  participant_joined: "👤",
  participant_invited: "📨",
  participant_removed: "❌",
  brief_generated: "✨",
  nda_generated: "📄",
  nda_signed: "✍",
  milestone_created: "🎯",
  milestone_released: "💚",
  milestone_submitted: "📬",
  ticket_created: "🎫",
  notes_updated: "📝",
  room_contracted: "🤝",
  room_closed: "🔒",
};

function ActivityFeed({ roomId }: { roomId: string }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("dehix_token");
    fetch(`/api/rooms/${roomId}/activity`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { setActivities(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [roomId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-card/50 border border-border/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">No activity recorded yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Events like milestone releases, NDA signing, and contract actions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-2xl">
      <div className="text-xs text-muted-foreground mb-3">{activities.length} event{activities.length !== 1 ? "s" : ""} in this room</div>
      {activities.map((a: any) => (
        <div key={a._id} className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/40 px-3 py-2.5">
          <span className="text-base shrink-0 mt-0.5">{ACTIVITY_ICONS[a.type] ?? "•"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground/90">{ACTIVITY_LABELS[a.type] ?? a.type}</div>
            {a.meta?.title && (
              <div className="text-[11px] text-muted-foreground truncate">{String(a.meta.title)}{a.meta?.amountUsd ? ` — $${Number(a.meta.amountUsd).toLocaleString()}` : ""}</div>
            )}
            {a.type === "nda_signed" && (
              <div className="text-[11px] text-muted-foreground">{a.meta?.fullyExecuted ? "Fully executed" : "Partial signature"}</div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">
            {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      ))}
    </div>
  );
}

const TICKET_COLUMNS = [
  { key: "backlog" as const, label: "Backlog" },
  { key: "todo" as const, label: "Todo" },
  { key: "in_progress" as const, label: "In Progress" },
  { key: "done" as const, label: "Done" },
];

const STATUS_COLORS: Record<string, string> = {
  scoping: "text-blue-400 bg-blue-950/40 border-blue-800/40",
  matching: "text-amber-400 bg-amber-950/40 border-amber-800/40",
  open: "text-emerald-400 bg-emerald-950/40 border-emerald-800/40",
  assembling: "text-violet-400 bg-violet-950/40 border-violet-800/40",
  contracted: "text-cyan-400 bg-cyan-950/40 border-cyan-800/40",
  closed: "text-gray-400 bg-gray-950/40 border-gray-700/40",
};

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  isAi: boolean;
  createdAt: any;
}

let localMsgId = 0;

export default function LiveRoom() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("brief");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneAmount, setNewMilestoneAmount] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [docMode, setDocMode] = useState(false);
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);
  const [docType, setDocType] = useState("pitch_deck");
  const [genDocLoading, setGenDocLoading] = useState(false);
  const [genDocError, setGenDocError] = useState<string | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState<{ title: string; documentType: string; content: string; messageCount?: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [suggestingMilestones, setSuggestingMilestones] = useState(false);
  const [approvingMilestone, setApprovingMilestone] = useState<string | null>(null);
  const [submittingMilestone, setSubmittingMilestone] = useState<string | null>(null);
  const [matchingTalent, setMatchingTalent] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [suggestingTickets, setSuggestingTickets] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [editingMeetLink, setEditingMeetLink] = useState(false);
  const [meetLinkInput, setMeetLinkInput] = useState("");
  const [savingMeetLink, setSavingMeetLink] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chatSummary, setChatSummary] = useState<{ summary: string; keyDecisions: string[]; actionItems: string[] } | null>(null);
  const [activityFeed, setActivityFeed] = useState<{ type: string; label: string; at: string; icon: string }[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  const roomId = id ?? "";

  const { data: roomData, isLoading: loadingRoom, refetch: refetchRoom } = useGetRoom(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomQueryKey(roomId) },
  });
  const { data: ticketsData, refetch: refetchTickets } = useGetRoomTickets(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomTicketsQueryKey(roomId) },
  });
  const { data: milestonesData, refetch: refetchMilestones } = useGetRoomMilestones(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomMilestonesQueryKey(roomId) },
  });
  const { data: ndaData, refetch: refetchNda } = useGetRoomNda(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomNdaQueryKey(roomId) },
  });

  const room = roomData as any;
  const tickets = Array.isArray(ticketsData) ? ticketsData : [];
  const milestones = Array.isArray(milestonesData) ? milestonesData : [];
  const nda = ndaData as any;

  const addLocalMessage = useCallback((msg: Omit<ChatMessage, "id" | "createdAt">) => {
    const newMsg: ChatMessage = { ...msg, id: String(++localMsgId), createdAt: new Date() };
    setChatMessages((prev) => [...prev, newMsg]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const createTicket = useCreateTicket({
    mutation: { onSuccess: () => { setNewTicketTitle(""); refetchTickets(); } },
  });
  const updateTicket = useUpdateTicket({
    mutation: { onSuccess: () => refetchTickets() },
  });
  const createMilestone = useCreateMilestone({
    mutation: {
      onSuccess: () => { setNewMilestoneTitle(""); setNewMilestoneAmount(""); refetchMilestones(); },
    },
  });
  const signNda = useSignNda({
    mutation: { onSuccess: () => refetchNda() },
  });
  const generateNda = useGenerateNda({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRoomNdaQueryKey(roomId) });
        refetchNda();
      },
    },
  });
  const assembleSquad = useAssembleSquad({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }) },
  });
  const callAiChat = async (message: string, history: ChatMessage[]) => {
    setAiLoading(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const historyPayload = history.slice(-15).map((m) => ({
        role: m.isAi ? "assistant" : "user",
        content: m.isAi ? m.message : `${m.userName}: ${m.message}`,
      }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, roomId, history: historyPayload }),
      });
      const data = await res.json();
      const reply = data.reply ?? "I couldn't process that.";
      const aiMsg = { userId: "ai", userName: "DEHIX AI", message: reply, isAi: true };
      if (isFirebaseEnabled && db) {
        await addDoc(collection(db, `liverooms/${roomId}/messages`), { ...aiMsg, createdAt: serverTimestamp() });
      } else {
        addLocalMessage(aiMsg);
      }
    } catch {
      addLocalMessage({ userId: "ai", userName: "DEHIX AI", message: "Sorry, I hit an error. Please try again.", isAi: true });
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateDoc = async () => {
    if (startIdx === null || endIdx === null) return;
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const selectedMessages = chatMessages.slice(lo, hi + 1);
    setGenDocLoading(true);
    setGenDocError(null);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: selectedMessages.map((m) => ({ userName: m.userName, message: m.message, isAi: m.isAi })),
          documentType: docType,
          roomTitle: room?.title ?? "Project",
          roomId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to generate document");
      }
      const doc = await res.json();
      setGeneratedDoc(doc);
    } catch (e: any) {
      setGenDocError(e.message ?? "Failed to generate document");
    } finally {
      setGenDocLoading(false);
    }
  };

  useEffect(() => {
    if (!roomId || !user) return;
    const socket = io(window.location.origin, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("room:join", { roomId, userId: user._id });
    socket.on("room:participant_joined", () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }));
    socket.on("room:participant_invited", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.info("A new talent was invited to this room"); });
    socket.on("room:ticket_updated", () => refetchTickets());
    socket.on("room:milestone_updated", () => refetchMilestones());
    socket.on("room:nda_signed", () => { refetchNda(); toast.info("NDA was signed by a participant"); });
    socket.on("room:squad_formed", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.success("Squad assembled! NDA is ready to sign."); });
    socket.on("room:status_changed", ({ status }: { status: string }) => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.info(`Room status changed to ${status}`); });
    socket.on("room:meet_link_updated", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); });
    socket.on("room:notes_updated", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); });
    socket.on("room:participant_removed", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.info("A participant was removed from the room"); });
    return () => { socket.disconnect(); };
  }, [roomId, user]);

  useEffect(() => {
    if (!roomId || !isFirebaseEnabled || !db) return;
    const q = fsQuery(
      collection(db, `liverooms/${roomId}/messages`),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChatMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return () => unsub();
  }, [roomId]);

  const sendChat = async () => {
    if (!chatInput.trim() || !roomId || !user) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgData = { userId: user._id, userName: user.name, message: msg, isAi: false };
    if (isFirebaseEnabled && db) {
      await addDoc(collection(db, `liverooms/${roomId}/messages`), {
        ...msgData,
        createdAt: serverTimestamp(),
      });
    } else {
      addLocalMessage(msgData);
    }
  };

  const askAi = async () => {
    if (!chatInput.trim() || !roomId || !user || aiLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgData = { userId: user._id, userName: user.name, message: msg, isAi: false };
    if (isFirebaseEnabled && db) {
      await addDoc(collection(db, `liverooms/${roomId}/messages`), { ...msgData, createdAt: serverTimestamp() });
    } else {
      addLocalMessage(msgData);
    }
    await callAiChat(msg, chatMessages);
  };

  const loadActivity = async () => {
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/activity`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setActivityFeed(Array.isArray(data) ? data : []);
      setShowActivity(true);
    } catch {
      toast.error("Failed to load activity");
    }
  };

  const summarizeChat = async () => {
    if (chatMessages.length === 0) { toast.info("No messages to summarize yet"); return; }
    setSummaryLoading(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/chat-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: chatMessages.map(m => ({ userName: m.userName, message: m.message, isAi: m.isAi })), roomId }),
      });
      if (!res.ok) throw new Error("Failed to summarize");
      const data = await res.json();
      setChatSummary(data);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to summarize conversation");
    } finally {
      setSummaryLoading(false);
    }
  };

  const updateRoomStatus = async (newStatus: string) => {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    setStatusDropdown(false);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      toast.success(`Room status updated to ${newStatus}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const saveMeetLink = async () => {
    if (savingMeetLink) return;
    setSavingMeetLink(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/meet-link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetLink: meetLinkInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save meet link");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      setEditingMeetLink(false);
      toast.success("Meet link saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save meet link");
    } finally {
      setSavingMeetLink(false);
    }
  };

  const saveNotes = async () => {
    if (savingNotes) return;
    setSavingNotes(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: notesInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      setEditingNotes(false);
      toast.success("Notes saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const generateBrief = async () => {
    if (generatingBrief) return;
    setGeneratingBrief(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const scopeRes = await fetch("/api/ai/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: room?.rawDescription ?? room?.title, roomId }),
      });
      if (!scopeRes.ok) throw new Error("AI scoping failed");
      const briefData = await scopeRes.json();
      const saveRes = await fetch(`/api/rooms/${roomId}/brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brief: briefData }),
      });
      if (!saveRes.ok) throw new Error("Failed to save brief");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      toast.success("AI brief generated and saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate brief");
    } finally {
      setGeneratingBrief(false);
    }
  };

  const copyRoomCode = () => {
    if (!room?.roomCode) return;
    navigator.clipboard.writeText(room.roomCode).then(
      () => toast.success(`Room code ${room.roomCode} copied!`),
      () => toast.error("Could not copy room code")
    );
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const matchTalentForRoom = async () => {
    if (!roomId || matchingTalent) return;
    setMatchingTalent(true);
    setMatchResults([]);
    try {
      const token = localStorage.getItem("dehix_token");
      const room = roomData as any;
      const roles: any[] = room?.brief?.roles ?? [];
      if (roles.length === 0) { toast.info("Generate an AI brief first to get role requirements"); setMatchingTalent(false); return; }
      const firstRole = roles[0];
      const res = await fetch("/api/ai/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roleTitle: firstRole.roleTitle, skillDomain: firstRole.skillDomain, requiredLevel: firstRole.requiredLevel ?? 1, minReputation: firstRole.minReputation ?? 0 }),
      });
      if (!res.ok) throw new Error("Match failed");
      const data = await res.json();
      setMatchResults(Array.isArray(data) ? data : []);
      if (data.length === 0) toast.info("No matching talent found yet");
      else toast.success(`${data.length} matching candidate${data.length !== 1 ? "s" : ""} found`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to match talent");
    } finally {
      setMatchingTalent(false);
    }
  };

  const suggestMilestones = async () => {
    if (!roomId || suggestingMilestones) return;
    setSuggestingMilestones(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/suggest-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const data = await res.json();
      const suggestions = Array.isArray(data) ? data : data.milestones ?? [];
      for (const s of suggestions) {
        await fetch(`/api/rooms/${roomId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: s.title ?? s, description: s.description ?? undefined, amountUsd: s.amountUsd ?? undefined }),
        });
      }
      refetchMilestones();
      toast.success(`${suggestions.length} milestones added`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to suggest milestones");
    } finally {
      setSuggestingMilestones(false);
    }
  };

  const submitMilestone = async (milestoneId: string) => {
    if (submittingMilestone) return;
    setSubmittingMilestone(milestoneId);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/milestones/${milestoneId}/submit`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to submit milestone");
      refetchMilestones();
      toast.success("Milestone submitted for business review");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit milestone");
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const approveMilestone = async (milestoneId: string) => {
    if (approvingMilestone) return;
    setApprovingMilestone(milestoneId);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/milestones/${milestoneId}/approve`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to approve milestone");
      refetchMilestones();
      toast.success("Milestone approved and payment released");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to approve milestone");
    } finally {
      setApprovingMilestone(null);
    }
  };

  const updateMilestoneStatus = async (milestoneId: string, status: string) => {
    try {
      const token = localStorage.getItem("dehix_token");
      await fetch(`/api/rooms/${roomId}/milestones/${milestoneId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      refetchMilestones();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update milestone status");
    }
  };

  const suggestTickets = async () => {
    if (!roomId || suggestingTickets) return;
    setSuggestingTickets(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/suggest-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const suggestions: Array<{ title: string; estimatedHours?: number; milestoneNumber?: number }> = await res.json();
      for (const s of suggestions) {
        await fetch(`/api/rooms/${roomId}/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: s.title,
            estimatedHours: s.estimatedHours ?? undefined,
            milestoneNumber: s.milestoneNumber ?? 1,
          }),
        });
      }
      refetchTickets();
      toast.success(`${suggestions.length} tickets generated`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate tickets");
    } finally {
      setSuggestingTickets(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in to join this room</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }
  if (loadingRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading room...</div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Room not found</p>
          <Button onClick={() => navigate("/business/dashboard")}>Back</Button>
        </div>
      </div>
    );
  }

  const brief = room.aiScopedBrief as any;
  const roles = room.roles ?? [];
  const participants = room.participants ?? [];
  const isBusiness = user?.role === "business";
  const isOwner = isBusiness;
  const allRolesFilled = roles.length > 0 && roles.every((r: any) => ["filled", "accepted"].includes(r.status));
  const isSignedByMe = nda?.signedBy?.includes(user?._id ?? "");

  return (
    <>
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* TOP BAR */}
      <div className="shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(isBusiness ? "/business/dashboard" : "/talent/dashboard")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm shrink-0"
            >
              ← Back
            </button>
            <span className="text-border/40 shrink-0">/</span>
            <span className="font-semibold text-sm truncate">{room.title}</span>
            {isBusiness ? (
              <div className="relative shrink-0">
                <button
                  onClick={() => setStatusDropdown(!statusDropdown)}
                  disabled={updatingStatus}
                  className={`text-xs px-2 py-0.5 rounded border font-medium capitalize hover:opacity-80 transition-opacity ${STATUS_COLORS[room.status] ?? ""}`}
                >
                  {updatingStatus ? "..." : room.status} {!updatingStatus && "▾"}
                </button>
                {statusDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border/60 rounded-lg shadow-lg overflow-hidden min-w-[140px]">
                    {["scoping","matching","open","assembling","contracted","closed"].filter(s => s !== room.status).map(s => (
                      <button
                        key={s}
                        onClick={() => updateRoomStatus(s)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors capitalize"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize shrink-0 ${STATUS_COLORS[room.status] ?? ""}`}>
                {room.status}
              </span>
            )}
            <button
              onClick={copyRoomCode}
              title="Copy room code"
              className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/30"
            >
              {copiedCode ? <span className="text-emerald-400">✓ Copied!</span> : room.roomCode}
            </button>
            {room.contractedAt && (
              <span className="text-[10px] text-cyan-400/70 hidden md:inline">
                Contracted {new Date(room.contractedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isFirebaseEnabled && (
              <span className="text-[10px] text-amber-400 border border-amber-800/40 bg-amber-950/30 rounded px-2 py-0.5 hidden sm:inline">
                Demo chat
              </span>
            )}
            {isBusiness && (
              <button
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("dehix_token");
                    const res = await fetch(`/api/rooms/${roomId}/export`, { headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error("Export failed");
                    const { filename, content } = await res.json();
                    const blob = new Blob([content], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = filename; a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Room exported");
                  } catch {
                    toast.error("Export failed");
                  }
                }}
                title="Export room summary"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/40 hover:border-border/70 hidden sm:inline-flex items-center gap-1"
              >
                ↓ Export
              </button>
            )}
            {room.meetLink && (
              <a href={room.meetLink} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="text-xs h-7">Meet</Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 3-COLUMN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT */}
        <div className="w-56 shrink-0 border-r border-border/40 flex flex-col overflow-y-auto bg-card/30">
          <div className="p-3 space-y-5">
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Roles ({roles.length})
              </div>
              {roles.length === 0 ? (
                <div className="text-xs text-muted-foreground/50 py-2">No roles defined</div>
              ) : (
                <div className="space-y-1.5">
                  {roles.map((role: any) => (
                    <div key={role._id} className="rounded-lg border border-border/30 bg-background/40 p-2">
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <span className="text-xs font-medium text-foreground leading-tight line-clamp-2">{role.roleTitle}</span>
                        <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded border capitalize ml-1 ${
                          role.status === "filled" ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40" :
                          role.status === "accepted" ? "text-cyan-400 bg-cyan-950/40 border-cyan-800/40" :
                          "text-amber-400 bg-amber-950/40 border-amber-800/40"
                        }`}>
                          {role.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{role.skillDomain}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        L{role.requiredLevel} · {role.minReputation}+ rep
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Participants ({participants.length})
              </div>
              {participants.length === 0 ? (
                <div className="text-xs text-muted-foreground/50 py-2">Waiting for talent</div>
              ) : (
                <div className="space-y-1.5">
                  {participants.map((p: any) => {
                    const u = p.user ?? (typeof p.userId === "object" ? p.userId : null);
                    const matchedRole = roles.find((r: any) => String(r._id) === String(p.roleId));
                    return (
                      <div
                        key={p._id}
                        className="rounded-lg border border-border/30 bg-background/40 p-2 group"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => u?._id && navigate(`/talent/profile/${u._id}`)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          >
                            <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                              <span className="text-primary font-bold text-[9px]">{u?.name?.[0]?.toUpperCase() ?? "?"}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{u?.name ?? "User"}</div>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className={`text-[10px] ${p.status === "joined" ? "text-emerald-400" : "text-muted-foreground"}`}>
                                  {p.status}
                                </span>
                                {matchedRole && (
                                  <>
                                    <span className="text-border/40 text-[9px]">·</span>
                                    <span className="text-[10px] text-primary/70 truncate">{matchedRole.roleTitle}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                          {isBusiness && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Remove ${u?.name ?? "this participant"} from the room?`)) return;
                                try {
                                  const token = localStorage.getItem("dehix_token");
                                  const res = await fetch(`/api/rooms/${roomId}/participants/${p._id}`, {
                                    method: "DELETE",
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  if (!res.ok) throw new Error("Failed");
                                  queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
                                  toast.success(`${u?.name ?? "Participant"} removed`);
                                } catch {
                                  toast.error("Failed to remove participant");
                                }
                              }}
                              title="Remove from room"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive/60 hover:text-destructive text-[10px] shrink-0 px-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</div>
                <button
                  onClick={() => {
                    setNotesInput(room?.notes ?? "");
                    setEditingNotes(!editingNotes);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                  {editingNotes ? "Cancel" : "Edit"}
                </button>
              </div>
              {editingNotes ? (
                <div className="space-y-1.5">
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Add private room notes..."
                    rows={4}
                    className="w-full bg-card border border-border/50 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-primary/50 placeholder:text-muted-foreground/40 resize-none"
                  />
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="w-full text-xs bg-primary/15 hover:bg-primary/20 text-primary rounded-md py-1.5 transition-colors disabled:opacity-50"
                  >
                    {savingNotes ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              ) : room?.notes ? (
                <div className="rounded-lg border border-border/30 bg-background/40 p-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {room.notes}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/40 py-1">No notes yet</div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="shrink-0 border-b border-border/40 px-4 flex items-center gap-1 h-10">
            {(["brief", "tickets", "milestones", "nda", "activity"] as TabKey[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
                {t === "tickets" && tickets.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{tickets.length}</span>
                )}
                {t === "milestones" && milestones.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{milestones.length}</span>
                )}
                {t === "nda" && nda && (
                  <span className={`ml-1.5 w-1.5 h-1.5 rounded-full inline-block ${nda.status === "signed" ? "bg-emerald-400" : "bg-amber-400"}`} />
                )}
              </button>
            ))}
          </div>

          {/* Quick Stats bar */}
          {(tickets.length > 0 || milestones.length > 0) && (
            <div className="shrink-0 border-b border-border/30 px-4 py-1.5 flex items-center gap-4 bg-card/20 overflow-x-auto">
              {tickets.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">Tickets</span>
                    <span className="text-[10px] font-mono text-foreground">
                      {tickets.filter((t: any) => t.status === "done").length}/{tickets.length}
                    </span>
                    <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(tickets.filter((t: any) => t.status === "done").length / tickets.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-border/40 shrink-0">·</span>
                </>
              )}
              {milestones.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">Escrow</span>
                    <span className="text-[10px] font-mono text-emerald-400/80">
                      ${milestones.filter((m: any) => m.status === "released").reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">/</span>
                    <span className="text-[10px] font-mono font-semibold">
                      ${milestones.reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-border/40 shrink-0">·</span>
                </>
              )}
              {participants.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {participants.filter((p: any) => p.status === "joined").length} joined · {roles.length} roles
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {/* BRIEF */}
            {tab === "brief" && (
              <div className="space-y-4 max-w-2xl">
                {generatingBrief && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                    </div>
                    <p className="text-sm text-muted-foreground">AI is analyzing your project...</p>
                    <p className="text-xs text-muted-foreground/50">Scoping roles, timeline, risks and budget</p>
                  </div>
                )}
                {!brief && !generatingBrief ? (
                  <div className="space-y-4">
                    {room?.rawDescription && (
                      <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Project Description</div>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{room.rawDescription}</p>
                      </div>
                    )}
                    <div className="rounded-xl border border-dashed border-border/50 p-6 text-center space-y-3">
                      <p className="text-sm font-medium text-foreground/70">No AI brief yet</p>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                        Generate a full brief with roles, timeline, budget, and risk analysis from your description.
                      </p>
                      {isOwner && (
                        <Button size="sm" onClick={generateBrief} disabled={generatingBrief}>
                          ✨ Generate AI Brief
                        </Button>
                      )}
                    </div>
                  </div>
                ) : brief && !generatingBrief ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">AI-generated from project description</div>
                      {isOwner && (
                        <button
                          onClick={generateBrief}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          Regenerate ↺
                        </button>
                      )}
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                      <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">AI Project Brief</div>
                      <h2 className="font-bold text-lg mb-1">{brief.projectTitle}</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">{brief.projectSummary}</p>
                      <div className="flex items-center gap-4 mt-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          <span className="text-foreground/80 font-mono font-semibold">{brief.estimatedWeeks}w</span> timeline
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          <span className="text-foreground/80 font-semibold">{brief.complexity}</span> complexity
                        </span>
                        {brief.suggestedTotalBudgetUsd && (
                          <span className="text-xs text-muted-foreground">
                            <span className="text-foreground/80 font-mono font-semibold">${brief.suggestedTotalBudgetUsd?.toLocaleString()}</span> budget
                          </span>
                        )}
                      </div>
                    </div>

                    {brief.recommendedStack && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recommended Stack</div>
                        <div className="rounded-lg border border-border/40 bg-card px-4 py-3 text-sm text-muted-foreground">
                          {brief.recommendedStack}
                        </div>
                      </div>
                    )}

                    {brief.roles?.length > 0 && (() => {
                      const totalHours = (brief.roles as any[]).reduce((s: number, r: any) => s + (r.estimatedHours ?? 0), 0);
                      return totalHours > 0 ? (
                        <div className="flex items-center gap-4 rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-foreground">{totalHours}h</span>
                            <span>total across {brief.roles.length} role{brief.roles.length !== 1 ? "s" : ""}</span>
                          </div>
                          {brief.suggestedTotalBudgetUsd && (
                            <>
                              <span className="text-border/40">·</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-foreground">${brief.suggestedTotalBudgetUsd.toLocaleString()}</span>
                                <span>suggested budget</span>
                              </div>
                            </>
                          )}
                          {brief.estimatedWeeks && (
                            <>
                              <span className="text-border/40">·</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-foreground">{brief.estimatedWeeks}w</span>
                                <span>timeline</span>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {brief.roles?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Required Roles</div>
                        <div className="space-y-2">
                          {brief.roles.map((r: any, i: number) => (
                            <div key={i} className="rounded-lg border border-border/40 bg-card p-3 flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{r.roleTitle}</div>
                                <div className="text-xs text-primary mt-0.5">{r.skillDomain}</div>
                                {r.responsibilities?.length > 0 && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {r.responsibilities.slice(0, 2).join(" · ")}
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0 space-y-1">
                                <div className="text-xs font-mono text-muted-foreground">L{r.requiredLevel}</div>
                                <div className="text-xs text-muted-foreground">{r.minReputation}+ rep</div>
                                {r.estimatedHours && (
                                  <div className="text-xs font-mono text-muted-foreground">{r.estimatedHours}h</div>
                                )}
                                {isBusiness && (
                                  <button
                                    onClick={() => navigate(`/talent/discovery?skill=${encodeURIComponent(r.skillDomain ?? "")}&minRep=${r.minReputation ?? 0}`)}
                                    className="text-[10px] text-primary hover:underline font-medium"
                                  >
                                    Find talent →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {brief.technicalRisks?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Technical Risks</div>
                        <div className="space-y-1.5">
                          {brief.technicalRisks.map((r: string, i: number) => (
                            <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 text-destructive/80">
                              ⚠ {r}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isBusiness && brief.roles?.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Talent Match</div>
                          <button
                            onClick={matchTalentForRoom}
                            disabled={matchingTalent}
                            className="text-xs text-primary/70 hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {matchingTalent ? (
                              <><span className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin inline-block" /> Matching...</>
                            ) : "✨ Find matching talent"}
                          </button>
                        </div>
                        {matchResults.length > 0 && (
                          <div className="space-y-2">
                            {matchResults.map((m: any) => (
                              <div key={m.user._id} className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-foreground">{m.user.name}</div>
                                  <div className="text-[10px] text-primary">{m.credential?.skillDomain}</div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] font-mono text-muted-foreground">{m.credential?.reputationScore} rep</span>
                                  <button
                                    onClick={() => navigate(`/talent/profile/${m.user._id}`)}
                                    className="text-[10px] text-primary hover:underline"
                                  >
                                    View →
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* TICKETS */}
            {tab === "tickets" && (
              <div className="space-y-4">
                {isBusiness && (
                  <div className="space-y-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newTicketTitle.trim()) {
                          createTicket.mutate({ id: roomId, data: { title: newTicketTitle, milestoneNumber: 1 } });
                          setNewTicketTitle("");
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={newTicketTitle}
                        onChange={(e) => setNewTicketTitle(e.target.value)}
                        placeholder="New ticket title..."
                        className="flex-1 bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                      />
                      <Button size="sm" type="submit" disabled={createTicket.isPending}>Add</Button>
                    </form>
                    <button
                      onClick={suggestTickets}
                      disabled={suggestingTickets}
                      className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {suggestingTickets ? (
                        <>
                          <span className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
                          AI is generating tickets...
                        </>
                      ) : (
                        <>✨ AI generate tickets from brief</>
                      )}
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {TICKET_COLUMNS.map((col) => {
                    const colTickets = tickets.filter((t: any) => t.status === col.key);
                    return (
                      <div key={col.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{col.label}</span>
                          <span className="text-xs text-muted-foreground/50">{colTickets.length}</span>
                        </div>
                        <div className="space-y-1.5 min-h-[80px]">
                          {colTickets.map((t: any) => (
                            <div key={t._id} className={`rounded-lg border bg-card p-2.5 group border-l-2 ${
                              t.priority === "critical" ? "border-border/40 border-l-red-500/70" :
                              t.priority === "high" ? "border-border/40 border-l-amber-500/70" :
                              t.priority === "low" ? "border-border/40 border-l-blue-500/50" :
                              "border-border/40 border-l-border/40"
                            }`}>
                              <p className="text-xs font-medium leading-tight mb-1.5">{t.title}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                              {t.estimatedHours && (
                                <span className="text-[10px] text-muted-foreground font-mono">{t.estimatedHours}h</span>
                              )}
                              {t.priority && t.priority !== "medium" && (
                                <span className={`text-[10px] capitalize ${
                                  t.priority === "critical" ? "text-red-400" :
                                  t.priority === "high" ? "text-amber-400" :
                                  "text-blue-400"
                                }`}>{t.priority}</span>
                              )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {TICKET_COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                                  <button
                                    key={c.key}
                                    onClick={() => updateTicket.mutate({ id: t._id, data: { status: c.key } })}
                                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    → {c.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MILESTONES */}
            {tab === "milestones" && (
              <div className="space-y-4 max-w-2xl">
                {isBusiness && (
                  <div className="space-y-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newMilestoneTitle.trim()) {
                          createMilestone.mutate({
                            id: roomId,
                            data: { title: newMilestoneTitle, amountUsd: newMilestoneAmount ? Number(newMilestoneAmount) : undefined },
                          });
                          setNewMilestoneTitle("");
                          setNewMilestoneAmount("");
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={newMilestoneTitle}
                        onChange={(e) => setNewMilestoneTitle(e.target.value)}
                        placeholder="Milestone title..."
                        className="flex-1 bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                      />
                      <input
                        value={newMilestoneAmount}
                        onChange={(e) => setNewMilestoneAmount(e.target.value)}
                        placeholder="$USD"
                        type="number"
                        className="w-24 bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 font-mono placeholder:text-muted-foreground/50"
                      />
                      <Button size="sm" type="submit" disabled={createMilestone.isPending}>Add</Button>
                    </form>
                    <button
                      onClick={suggestMilestones}
                      disabled={suggestingMilestones}
                      className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {suggestingMilestones ? (
                        <>
                          <span className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
                          AI is suggesting milestones...
                        </>
                      ) : (
                        <>✨ AI suggest milestones</>
                      )}
                    </button>
                  </div>
                )}
                {milestones.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                    <p className="text-sm text-muted-foreground">No milestones yet</p>
                    {isBusiness && (
                      <p className="text-xs text-muted-foreground/50 mt-1">Add milestones manually or use AI to suggest them</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {milestones.map((m: any, i: number) => (
                      <div key={m._id} className={`rounded-xl border bg-card p-4 transition-colors ${
                        m.status === "released" ? "border-emerald-800/40 bg-emerald-950/10" : "border-border/40"
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              m.status === "released"
                                ? "border-emerald-500/50 bg-emerald-950/40"
                                : "border-primary/40 bg-primary/10"
                            }`}>
                              {m.status === "released" ? (
                                <span className="text-emerald-400 text-[10px] font-bold">✓</span>
                              ) : (
                                <span className="text-primary text-[10px] font-bold">{i + 1}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-sm">{m.title}</h3>
                              {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                              {!isBusiness && m.status !== "released" && m.status !== "submitted" && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {["pending", "in_progress", "completed"].filter(s => s !== m.status).map(s => (
                                    <button
                                      key={s}
                                      onClick={() => updateMilestoneStatus(m._id, s)}
                                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors capitalize"
                                    >
                                      → {s.replace("_", " ")}
                                    </button>
                                  ))}
                                  <button
                                    onClick={() => submitMilestone(m._id)}
                                    disabled={submittingMilestone === m._id}
                                    className="text-[10px] text-violet-400/80 hover:text-violet-400 border border-violet-800/40 hover:border-violet-600/60 bg-violet-950/20 hover:bg-violet-950/40 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                                  >
                                    {submittingMilestone === m._id ? "..." : "↑ Submit for review"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 space-y-1.5">
                            {m.amountUsd != null && (
                              <div className="font-mono font-bold text-sm">${m.amountUsd.toLocaleString()}</div>
                            )}
                            <div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${
                                m.status === "released" ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40" :
                                m.status === "completed" ? "text-cyan-400 bg-cyan-950/40 border-cyan-800/40" :
                                m.status === "submitted" ? "text-violet-400 bg-violet-950/40 border-violet-800/40" :
                                m.status === "in_progress" ? "text-amber-400 bg-amber-950/40 border-amber-800/40" :
                                "text-muted-foreground bg-muted/30 border-border/40"
                              }`}>
                                {m.status.replace("_", " ")}
                              </span>
                            </div>
                            {isBusiness && m.status !== "released" && (
                              <button
                                onClick={() => approveMilestone(m._id)}
                                disabled={approvingMilestone === m._id}
                                className={`text-[10px] border rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
                                  m.status === "submitted"
                                    ? "text-emerald-300 bg-emerald-900/30 border-emerald-700/50 hover:bg-emerald-900/60 animate-pulse"
                                    : "text-emerald-400/70 hover:text-emerald-400 border-emerald-800/40 hover:border-emerald-600/60 bg-emerald-950/20 hover:bg-emerald-950/40"
                                }`}
                              >
                                {approvingMilestone === m._id ? "..." : "✓ Release"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
                      <span>Total escrow</span>
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-400/70 font-mono">
                          ${milestones.filter((m: any) => m.status === "released").reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()} released
                        </span>
                        <span className="font-mono font-semibold text-foreground">
                          ${milestones.reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()} total
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITY */}
            {tab === "activity" && (
              <ActivityFeed roomId={roomId} />
            )}

            {/* NDA */}
            {tab === "nda" && (
              <div className="space-y-4 max-w-2xl">
                {/* Generation loading state */}
                {generateNda.isPending && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                    </div>
                    <p className="text-sm text-muted-foreground">Generating NDA document...</p>
                    <p className="text-xs text-muted-foreground/50">This may take a moment</p>
                  </div>
                )}

                {/* Generation error state */}
                {generateNda.isError && !generateNda.isPending && !nda && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-destructive text-[10px] font-bold">!</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-destructive">NDA generation failed</p>
                        <p className="text-xs text-destructive/70 mt-1">
                          {(generateNda.error as any)?.data?.error ?? (generateNda.error as any)?.message ?? "Something went wrong. Please try again."}
                        </p>
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => generateNda.mutate({ data: { roomId } })}
                          >
                            Try Again
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sign error */}
                {signNda.isError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    Failed to sign NDA: {(signNda.error as any)?.data?.error ?? "Please try again."}
                  </div>
                )}

                {/* Empty state — no NDA, no pending, no error */}
                {!nda && !generateNda.isPending && !generateNda.isError && (
                  <div className="rounded-xl border border-dashed border-border/50 p-8 text-center space-y-3">
                    <div className="text-sm font-medium text-foreground/70">No NDA generated yet</div>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      Generate a professional NDA covering confidentiality, IP rights, milestone payments, and dispute resolution.
                    </p>
                    {isOwner ? (
                      <Button
                        size="sm"
                        onClick={() => generateNda.mutate({ data: { roomId } })}
                        disabled={generateNda.isPending}
                      >
                        Generate NDA
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground/50">The room owner will generate the NDA</p>
                    )}
                  </div>
                )}

                {/* NDA document */}
                {nda && !generateNda.isPending && (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          status={
                            nda.status === "signed" ? "verified"
                            : nda.status === "pending_signatures" ? "disputed"
                            : "revoked"
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {nda.status === "signed"
                            ? "Fully signed"
                            : nda.status === "pending_signatures"
                            ? `${nda.signedBy?.length ?? 0} of 2 signatures`
                            : "Draft — awaiting signatures"}
                        </span>
                      </div>
                      {isOwner && nda.status === "draft" && (
                        <button
                          onClick={() => generateNda.mutate({ data: { roomId } })}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          Regenerate
                        </button>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-card/30">
                        <span className="text-[10px] text-muted-foreground font-medium">NDA Document</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(nda.content ?? "").then(
                              () => toast.success("NDA copied to clipboard!"),
                              () => toast.error("Failed to copy")
                            );
                          }}
                          className="text-[10px] text-muted-foreground hover:text-primary transition-colors px-2 py-0.5 rounded border border-border/30 hover:border-primary/30"
                        >
                          Copy NDA
                        </button>
                      </div>
                      <div className="p-5 max-h-80 overflow-y-auto">
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                          {nda.content}
                        </pre>
                      </div>
                    </div>

                    {nda.status !== "signed" && (
                      isSignedByMe ? (
                        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-center">
                          <span className="text-xs text-emerald-400 font-medium">You have signed this NDA ✓</span>
                          {nda.status === "pending_signatures" && (
                            <p className="text-[11px] text-emerald-400/60 mt-0.5">Waiting for other parties to sign</p>
                          )}
                        </div>
                      ) : (
                        <Button
                          className="w-full"
                          onClick={() => signNda.mutate({ id: roomId })}
                          disabled={signNda.isPending}
                        >
                          {signNda.isPending ? (
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" />
                              Signing...
                            </span>
                          ) : "Sign NDA"}
                        </Button>
                      )
                    )}

                    {nda.status === "signed" && (
                      <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-center">
                        <span className="text-xs text-emerald-400 font-semibold">NDA fully signed — room is now contracted ✓</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {isOwner && allRolesFilled && room.status === "open" && (
            <div className="shrink-0 border-t border-border/40 p-3">
              <Button
                className="w-full glow-purple"
                onClick={() => assembleSquad.mutate({ id: roomId })}
                disabled={assembleSquad.isPending}
              >
                {assembleSquad.isPending ? "Forming Squad..." : "Form Squad and Sign NDA"}
              </Button>
            </div>
          )}
          {isOwner && room.status === "contracted" && (
            <div className="shrink-0 border-t border-border/40 p-3">
              <button
                onClick={async () => {
                  if (!confirm("Close this room? This marks the project as complete.")) return;
                  try {
                    const token = localStorage.getItem("dehix_token");
                    const res = await fetch(`/api/rooms/${roomId}/close`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error("Failed to close room");
                    toast.success("Room closed successfully");
                    refetchRoom();
                  } catch {
                    toast.error("Failed to close room");
                  }
                }}
                className="w-full text-xs py-2 rounded-lg border border-gray-700/60 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors"
              >
                Close Room
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Chat */}
        <div className="w-80 shrink-0 border-l border-border/40 flex flex-col overflow-hidden bg-card/20">

          {/* Meet link */}
          <div className="shrink-0 border-b border-border/40 p-3">
            {editingMeetLink ? (
              <div className="space-y-1.5">
                <input
                  value={meetLinkInput}
                  onChange={(e) => setMeetLinkInput(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full bg-card border border-border/50 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-primary/50 placeholder:text-muted-foreground/40"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveMeetLink(); if (e.key === "Escape") { setEditingMeetLink(false); } }}
                />
                <div className="flex gap-1.5">
                  <button onClick={saveMeetLink} disabled={savingMeetLink} className="flex-1 text-xs py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50">
                    {savingMeetLink ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setEditingMeetLink(false)} className="text-xs py-1 px-2 rounded text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : room.meetLink ? (
              <div className="flex items-center gap-1.5">
                <a href={room.meetLink} target="_blank" rel="noreferrer" className="flex-1 block">
                  <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-center hover:border-emerald-700/60 transition-colors">
                    <div className="text-xs text-emerald-400 font-medium">Google Meet</div>
                    <div className="text-[10px] text-emerald-400/60 mt-0.5">Click to join video call</div>
                  </div>
                </a>
                {isBusiness && (
                  <button onClick={() => { setMeetLinkInput(room.meetLink ?? ""); setEditingMeetLink(true); }} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-xs shrink-0 p-1" title="Edit meet link">✎</button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border/40 bg-card/50 px-3 py-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">No video link yet</div>
                {isBusiness && (
                  <button onClick={() => { setMeetLinkInput(""); setEditingMeetLink(true); }} className="text-xs text-primary/60 hover:text-primary transition-colors">+ Add</button>
                )}
              </div>
            )}
          </div>

          {/* Chat header */}
          <div className="shrink-0 px-3 py-2 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {docMode ? "Document Mode" : "Live Chat"}
              </span>
              {docMode && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 border border-primary/30 text-primary font-semibold">
                  Select range
                </span>
              )}
              {!isFirebaseEnabled && !docMode && (
                <span className="text-[9px] text-amber-400/70 font-medium">demo</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!docMode && chatMessages.length > 0 && (
                <button
                  onClick={summarizeChat}
                  disabled={summaryLoading}
                  title="AI summarize conversation"
                  className="text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50"
                >
                  {summaryLoading ? "..." : "∑ Sum"}
                </button>
              )}
              {!docMode && (
                <button
                  onClick={() => { if (showActivity) { setShowActivity(false); } else { loadActivity(); } }}
                  title="Room activity feed"
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    showActivity
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-primary/30 hover:text-primary"
                  }`}
                >
                  ⚡ Activity
                </button>
              )}
              <button
                onClick={() => { setDocMode(!docMode); setStartIdx(null); setEndIdx(null); setGenDocError(null); setChatSummary(null); setShowActivity(false); }}
                className={`text-[10px] px-2 py-1 rounded border transition-colors font-medium ${
                  docMode
                    ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border/40 text-muted-foreground hover:border-primary/30 hover:text-primary"
                }`}
              >
                {docMode ? "✕ Exit" : "Doc Mode"}
              </button>
            </div>
          </div>

          {/* Chat Summary panel */}
          {chatSummary && !docMode && (
            <div className="shrink-0 border-b border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">AI Summary</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const text = [
                        chatSummary.summary,
                        chatSummary.keyDecisions?.length ? `\nKey Decisions:\n${chatSummary.keyDecisions.map(d => `• ${d}`).join("\n")}` : "",
                        chatSummary.actionItems?.length ? `\nAction Items:\n${chatSummary.actionItems.map(a => `→ ${a}`).join("\n")}` : "",
                      ].join("");
                      navigator.clipboard.writeText(text).then(() => toast.success("Summary copied!"), () => toast.error("Failed to copy"));
                    }}
                    className="text-[9px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded border border-border/30 hover:border-primary/30"
                  >
                    Copy
                  </button>
                  <button onClick={() => setChatSummary(null)} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{chatSummary.summary}</p>
              {chatSummary.keyDecisions?.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Key Decisions</div>
                  {chatSummary.keyDecisions.map((d, i) => (
                    <div key={i} className="text-[10px] text-foreground/70 flex gap-1"><span className="text-primary shrink-0">·</span>{d}</div>
                  ))}
                </div>
              )}
              {chatSummary.actionItems?.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Action Items</div>
                  {chatSummary.actionItems.map((a, i) => (
                    <div key={i} className="text-[10px] text-foreground/70 flex gap-1"><span className="text-emerald-400 shrink-0">→</span>{a}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity feed panel */}
          {showActivity && !docMode && (
            <div className="shrink-0 border-b border-amber-800/30 bg-amber-950/10 p-3 max-h-52 overflow-y-auto space-y-1.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Room Activity</span>
                <button onClick={() => setShowActivity(false)} className="text-[9px] text-muted-foreground hover:text-foreground">✕</button>
              </div>
              {activityFeed.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50 text-center py-2">No activity yet</p>
              ) : (
                activityFeed.map((e, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs shrink-0">{e.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[10px] text-foreground/70 leading-snug">{e.label}</p>
                      <p className="text-[9px] text-muted-foreground/40">{new Date(e.at).toLocaleDateString()} {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Doc mode hint */}
          {docMode && startIdx === null && (
            <div className="shrink-0 px-3 py-2 bg-primary/5 border-b border-primary/10">
              <p className="text-[10px] text-primary/70 leading-relaxed">
                Click <strong>Set Start</strong> on a message, then <strong>Set End</strong> on another to select a conversation range for document generation.
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {chatMessages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <p className="text-xs text-muted-foreground/40">
                  {docMode ? "No messages to select yet" : "Start the conversation"}
                </p>
                {!isFirebaseEnabled && !docMode && (
                  <p className="text-[10px] text-muted-foreground/30 leading-relaxed px-2">
                    Chat is session-only in demo mode.
                  </p>
                )}
              </div>
            )}

            {chatMessages.map((msg, idx) => {
              const lo = startIdx !== null && endIdx !== null ? Math.min(startIdx, endIdx) : null;
              const hi = startIdx !== null && endIdx !== null ? Math.max(startIdx, endIdx) : null;
              const inRange = lo !== null && hi !== null && idx >= lo && idx <= hi;
              const isStart = startIdx === idx;
              const isEnd = endIdx === idx;

              return (
                <div
                  key={msg.id}
                  className={`rounded-lg p-2 text-xs transition-colors ${
                    inRange
                      ? "bg-primary/10 border border-primary/25 ring-1 ring-primary/10"
                      : msg.isAi
                      ? "bg-primary/5 border border-primary/15"
                      : "bg-card border border-border/30"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.isAi && (
                      <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 rounded px-1 py-0.5 font-semibold">AI</span>
                    )}
                    <span className={`text-[11px] font-medium flex-1 ${msg.isAi ? "text-primary" : "text-foreground/80"}`}>
                      {msg.userName}
                    </span>
                    {inRange && (
                      <span className="text-[8px] text-primary/60 font-mono">{idx - (lo ?? 0) + 1}</span>
                    )}
                  </div>

                  <p className="text-foreground/85 leading-relaxed whitespace-pre-wrap">{msg.message}</p>

                  {docMode && (
                    <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-border/20">
                      <button
                        onClick={() => setStartIdx(idx)}
                        className={`text-[9px] px-1.5 py-0.5 rounded transition-colors font-medium ${
                          isStart
                            ? "bg-primary text-white"
                            : "bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary"
                        }`}
                      >
                        {isStart ? "▶ Start" : "Set Start"}
                      </button>
                      <button
                        onClick={() => setEndIdx(idx)}
                        className={`text-[9px] px-1.5 py-0.5 rounded transition-colors font-medium ${
                          isEnd
                            ? "bg-primary text-white"
                            : "bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary"
                        }`}
                      >
                        {isEnd ? "◀ End" : "Set End"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI typing indicator */}
            {aiLoading && (
              <div className="rounded-lg p-2 text-xs bg-primary/5 border border-primary/15">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 rounded px-1 py-0.5 font-semibold">AI</span>
                  <span className="text-[11px] font-medium text-primary">DEHIX AI</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Document generation controls */}
          {docMode && startIdx !== null && endIdx !== null && (
            <div className="shrink-0 border-t border-primary/20 bg-primary/5 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-primary font-semibold">
                  {Math.abs(endIdx - startIdx) + 1} messages selected
                </span>
                <button
                  onClick={() => { setStartIdx(null); setEndIdx(null); setGenDocError(null); }}
                  className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              </div>

              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-background border border-border/50 rounded-md px-2 py-1.5 text-xs outline-none focus:border-primary/50 text-foreground"
              >
                <option value="pitch_deck">Pitch Deck</option>
                <option value="technical_deck">Technical Deck</option>
                <option value="bd_strategy">BD Strategy</option>
                <option value="sow">Statement of Work</option>
                <option value="project_brief">Project Brief</option>
              </select>

              {genDocError && (
                <p className="text-[10px] text-destructive leading-relaxed">{genDocError}</p>
              )}

              <Button
                size="sm"
                className="w-full text-xs h-7 glow-purple"
                onClick={handleGenerateDoc}
                disabled={genDocLoading}
              >
                {genDocLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" />
                    Generating...
                  </span>
                ) : "Generate Document"}
              </Button>
            </div>
          )}

          {/* Chat input */}
          {!docMode && (
            <div className="shrink-0 border-t border-border/40 p-2.5 space-y-1.5">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAi(); }
                }}
                placeholder="Ask anything… Enter to send to AI"
                className="w-full bg-card border border-border/50 rounded-md px-2.5 py-2 text-xs outline-none focus:border-primary/50 placeholder:text-muted-foreground/40 resize-none min-h-[52px]"
                rows={2}
              />
              <Button
                size="sm"
                className="w-full text-xs h-7"
                onClick={askAi}
                disabled={!chatInput.trim() || aiLoading}
              >
                {aiLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full border border-white/40 border-t-white animate-spin" />
                    Thinking...
                  </span>
                ) : "Ask AI"}
              </Button>
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || aiLoading}
                className="w-full text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
              >
                Send to room only (no AI)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Document modal */}
    <DocModal doc={generatedDoc} onClose={() => setGeneratedDoc(null)} />
    </>
  );
}
