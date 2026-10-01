import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Copy, ExternalLink,
  Eye, FileText, Fingerprint, GraduationCap, Grid2X2, Laptop, Link2, LockKeyhole,
  LogOut, Maximize2, Monitor, MoreHorizontal, Plus, Radio, RefreshCw, Search, Shield,
  ShieldCheck, ShieldAlert, Sparkles, UserRound, Users, Video, Webcam, X
} from "lucide-react";
import { startFaceTracking } from "./faceTracker.js";
import { isEntireDisplaySurface } from "./screenShare.js";

const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
};

let preserveMediaDuringHotUpdateUntil = 0;
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", () => { preserveMediaDuringHotUpdateUntil = Date.now() + 5000; });
  import.meta.hot.on("vite:afterUpdate", () => { preserveMediaDuringHotUpdateUntil = Date.now() + 5000; });
}
const isViteHotUpdate = () => Boolean(import.meta.hot && Date.now() < preserveMediaDuringHotUpdateUntil);

const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const statusLabel = (status) => ({ setup: "Setting up", "awaiting-review": "Needs review", approved: "In progress", ended: "Completed" }[status] || status);

export default function App() {
  const joinId = new URLSearchParams(location.search).get("join");
  return joinId ? <StudentJoin sessionId={joinId} /> : <LecturerDashboard />;
}

function LecturerDashboard() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [session, setSession] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api("/sessions");
      setSessions(data);
      const id = selectedId || data[0]?.id;
      if (id) {
        setSelectedId(id);
        setSession(data.find((item) => item.id === id) || await api(`/sessions/${id}`));
      } else setSession(null);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);

  const filtered = sessions.filter((item) => `${item.title} ${item.lecturerName}`.toLowerCase().includes(search.toLowerCase()));
  const students = session?.students || [];
  const needsReview = students.filter((student) => student.status === "awaiting-review").length;
  const active = students.filter((student) => student.status === "approved").length;

  async function createSession(data) {
    const created = await api("/sessions", { method: "POST", body: JSON.stringify(data) });
    setSessions((old) => [created, ...old]);
    setSelectedId(created.id);
    setSession(created);
    setShowCreate(false);
    setToast("Assessment session created");
  }

  async function approveStudent(studentId, approved) {
    await api(`/sessions/${session.id}/students/${studentId}/approval`, {
      method: "PATCH", body: JSON.stringify({ approved, reviewer: "Lecturer" })
    });
    await refresh();
    setToast(approved ? "Student approved to begin" : "Review decision saved");
  }

  async function copyJoinLink() {
    if (!session) return;
    const url = `${location.origin}/?join=${session.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopyFailed(false);
      setToast("Student join link copied");
    } catch {
      const copied = fallbackCopy(url);
      setCopyFailed(!copied);
      setToast(copied ? "Student join link copied" : "Select and copy the invite link below");
    }
  }

  async function endAssessment() {
    if (!session || !window.confirm("End this assessment? Students will no longer be able to join.")) return;
    await api(`/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) });
    await refresh();
    setToast("Assessment ended. Reports remain available.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={19} /></div><span>verity<span className="brand-dot">.</span></span><span className="brand-tag">ASSESS</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="nav-item active"><Grid2X2 size={17} /> Overview</button>
        <button className="nav-item" onClick={() => setShowCreate(true)}><Radio size={17} /> Live sessions <span className="nav-count">{sessions.length}</span></button>
        <button className="nav-item" onClick={() => setToast("Reports are available within each session.")}><FileText size={17} /> Reports</button>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><span>Visit the proctor guide</span><ArrowUpRight size={15} /></div>
          <div className="profile"><div className="avatar lecturer-avatar">JM</div><div className="profile-copy"><strong>Jordan Miller</strong><span>Lecturer account</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div><div className="topbar-actions"><div className="secure-pill"><span className="secure-dot" /> Secure workspace</div><button className="icon-button" aria-label="Notifications" onClick={() => setToast("You’re all caught up.")}><Bell size={18} /><i /></button><div className="avatar lecturer-avatar small">JM</div></div></header>
        <div className="page-content">
          <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={13} /> YOUR ASSESSMENT SPACE</div><h1>Good morning, Jordan <span className="wave">✳</span></h1><p className="subhead">A clear view of your assessments and the students in them.</p></div><button className="button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> New assessment</button></div>

          <section className="metric-grid">
            <Metric label="Live assessments" value={sessions.filter((item) => item.status === "live").length} note="Across your workspace" icon={<Radio size={17} />} accent="green" />
            <Metric label="Students in progress" value={active} note="Currently approved" icon={<Users size={17} />} accent="blue" />
            <Metric label="Awaiting your review" value={needsReview} note={needsReview ? "Action recommended" : "Nothing needs attention"} icon={<ShieldAlert size={17} />} accent={needsReview ? "amber" : "lilac"} />
          </section>

          <section className="session-section">
            <div className="section-heading"><div><h2>Assessment sessions</h2><p>Manage live proctoring and review session activity.</p></div><button className="button-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button></div>
            <div className="session-tabs"><button className="tab active">All sessions <span>{sessions.length}</span></button><button className="tab" onClick={() => setToast("Live sessions are shown in the session list.")}>Live</button><button className="tab" onClick={() => setToast("Reports are available when you select a session.")}>Recent reports</button><div className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an assessment" /></div></div>
            <div className="session-table-wrap">
              <table className="session-table"><thead><tr><th>ASSESSMENT</th><th>STATUS</th><th>STUDENTS</th><th>NEEDS REVIEW</th><th>STARTED</th><th /></tr></thead>
                <tbody>{loading ? <tr><td colSpan="6" className="empty-row">Loading sessions…</td></tr> : filtered.length ? filtered.map((item) => <tr className={selectedId === item.id ? "selected-row" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setSession(item); }}><td><div className="assessment-cell"><div className="assessment-icon"><BookOpen size={17} /></div><div><strong>{item.title}</strong><span>Hosted by {item.lecturerName}</span></div></div></td><td><StatusPill status={item.status} /></td><td><div className="student-stack">{(item.students || []).slice(0, 3).map((student, index) => <div className={`avatar student-avatar color-${index % 4}`} key={student.id}>{initials(student.studentName)}</div>)}<span>{item.students?.length || 0} joined</span></div></td><td><span className={item.students?.some((student) => student.status === "awaiting-review") ? "review-count has-review" : "review-count"}>{item.students?.filter((student) => student.status === "awaiting-review").length || 0}</span></td><td className="time-cell">{formatTime(item.createdAt)}</td><td><button className="row-arrow" aria-label="Select session"><ArrowRight size={16} /></button></td></tr>) : <tr><td colSpan="6" className="empty-row"><div className="empty-state"><div className="empty-icon"><BookOpen size={22} /></div><strong>No assessment sessions yet</strong><span>Create your first session and share its student join link.</span><button className="button-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Create session</button></div></td></tr>}</tbody>
              </table>
            </div>
          </section>

          {session && <SessionDetail session={session} onCopy={copyJoinLink} joinLink={`${location.origin}/?join=${session.id}`} copyFailed={copyFailed} onApprove={approveStudent} onRefresh={refresh} onEnd={endAssessment} />}
          <footer className="page-footer"><span><LockKeyhole size={13} /> Student permission is always required for camera and screen access.</span><span>Verity MVP <span className="footer-sep">·</span> Local prototype</span></footer>
        </div>
      </main>
      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} onCreate={createSession} />}
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function Metric({ label, value, note, icon, accent }) {
  return <div className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-bottom"><strong>{value}</strong><span>{note}</span></div></div>;
}

function CreateSessionModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [lecturerName, setLecturerName] = useState("Jordan Miller");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onCreate({ title: title.trim(), lecturerName: lecturerName.trim() }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal-card" onSubmit={submit}><div className="modal-top"><div className="modal-symbol"><Plus size={19} /></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><h2>Start an assessment</h2><p>Create a monitored session, then share its private join link with your class.</p><label className="field-label">Assessment name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Biology · Unit 4 quiz" required /></label><label className="field-label">Lecturer name<input value={lecturerName} onChange={(event) => setLecturerName(event.target.value)} required /></label>{error && <div className="form-error">{error}</div>}<div className="modal-foot"><span><Shield size={14} /> Students choose to enable each device.</span><button className="button-primary" disabled={busy}>{busy ? "Creating…" : "Create session"}<ArrowRight size={16} /></button></div></form></div>;
}

function SessionDetail({ session, onCopy, onApprove, onRefresh, onEnd, joinLink, copyFailed }) {
  const students = session.students || [];
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || null);
  const selected = students.find((student) => student.id === selectedStudentId) || students[0] || null;
  useEffect(() => { if (!students.find((student) => student.id === selectedStudentId)) setSelectedStudentId(students[0]?.id || null); }, [students, selectedStudentId]);
  function downloadReport() {
    const report = {
      assessment: { id: session.id, title: session.title, lecturerName: session.lecturerName, status: session.status, createdAt: session.createdAt, endedAt: session.endedAt || null },
      exportedAt: new Date().toISOString(),
      students: session.students.map(({ id, studentName, studentNumber, status, consentAt, joinedAt, approvedAt, approvedBy, precheckShots, events }) => ({ id, studentName, studentNumber, status, consentAt, joinedAt, approvedAt, approvedBy, precheckShots, events }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `verity-${session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <section className="detail-section"><div className="section-heading detail-heading"><div><div className="eyebrow"><Radio size={12} /> {session.status === "live" ? "LIVE SESSION" : "COMPLETED SESSION"}</div><h2>{session.title}</h2><p>Started {new Date(session.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} <span className="bullet">·</span> {students.length} student{students.length === 1 ? "" : "s"} joined</p></div><div className="detail-actions">{session.status === "live" && <button className="button-secondary" onClick={onEnd}><X size={14} /> End assessment</button>}<button className="button-secondary" onClick={downloadReport}><FileText size={14} /> Export report</button><button className="button-secondary" onClick={onCopy}><Link2 size={15} /> Copy join link</button><button className="button-primary compact" onClick={onRefresh}><RefreshCw size={15} /> Update</button></div></div>
    <div className="join-banner"><div className="join-banner-icon"><Link2 size={18} /></div><div><strong>Invite students to join</strong><span>Anyone with this link can request access to this assessment.</span></div><button onClick={onCopy}><Copy size={15} /> Copy invite link</button></div>
    {copyFailed && <div className="manual-link-row"><label htmlFor="student-invite-link">Copy this student link manually</label><input id="student-invite-link" readOnly value={joinLink} onFocus={(event) => event.target.select()} onClick={(event) => event.target.select()} /><button className="button-secondary" onClick={() => { const field = document.getElementById("student-invite-link"); field?.focus(); field?.select(); }}>Select link</button></div>}
    {!students.length ? <div className="session-empty"><div className="empty-icon"><Users size={21} /></div><strong>Waiting for students to join</strong><span>Share the link above. Each student will have a separate review and activity log.</span></div> : <div className="detail-content"><div className="student-list"><div className="list-title">STUDENT SESSIONS <span>{students.length}</span></div>{students.map((student, index) => <button key={student.id} className={`student-list-item ${selected?.id === student.id ? "chosen" : ""}`} onClick={() => setSelectedStudentId(student.id)}><div className={`avatar student-avatar color-${index % 4}`}>{initials(student.studentName)}</div><span className="student-list-copy"><strong>{student.studentName}</strong><small>{student.studentNumber}</small></span><StatusDot status={student.status} /></button>)}</div>
      {selected ? <StudentReport session={session} student={selected} onApprove={onApprove} /> : null}</div>}
  </section>;
}

function StudentReport({ session, student, onApprove }) {
  const [activeTab, setActiveTab] = useState("Overview");
  return <div className="report-panel"><div className="report-person"><div><div className="report-heading"><div className="avatar student-avatar color-2 large">{initials(student.studentName)}</div><div><h3>{student.studentName}</h3><span>{student.studentNumber} <span className="bullet">·</span> Joined {formatTime(student.joinedAt)}</span></div></div></div><StatusPill status={student.status} /></div>
    <div className="report-tabs">{["Overview", "Activity log"].map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}{tab === "Activity log" && <span>{student.events?.length || 0}</span>}</button>)}</div>
    {activeTab === "Overview" ? <><LiveFeeds sessionId={session.id} student={student}/><div className="evidence-heading"><div><h4>Workspace check</h4><span>Student-submitted background scan</span></div><span className="evidence-count">{student.precheckShots?.length || 0} images</span></div><div className="scan-grid">{student.precheckShots?.length ? student.precheckShots.map((shot) => <div className="scan-shot" key={shot.label}><img src={shot.imageDataUrl} alt={`${shot.label} room scan`} /><span>{shot.label}</span></div>) : <div className="no-evidence"><Webcam size={18} /> Background scan has not been submitted.</div>}</div><div className="review-bar"><div className="review-bar-copy"><ShieldCheck size={17}/><span>{student.status === "awaiting-review" ? "Review the check before allowing the quiz to begin." : student.status === "approved" ? "Student has been approved for this session." : "Student is completing their device setup."}</span></div>{student.status === "awaiting-review" && <div className="review-buttons"><button className="button-secondary" onClick={() => onApprove(student.id, false)}>Hold for review</button><button className="button-primary compact" onClick={() => onApprove(student.id, true)}><Check size={15}/> Approve student</button></div>}</div></> : <EventTimeline events={student.events || []} />}
  </div>;
}

function LiveFeeds({ sessionId, student }) {
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const screenTileRef = useRef(null);
  const sessionFeedsRef = useRef(null);
  const receivedStreams = useRef({ screen: null, camera: null });
  const signalingRef = useRef(null);
  const latestCameraCue = [...(student.events || [])].reverse().find((event) => event.type.startsWith("face-") || event.type === "multiple-faces-detected");
  const [screenState, setScreenState] = useState("Connecting");
  const [cameraState, setCameraState] = useState("Connecting");
  const [retrying, setRetrying] = useState(false);
  const [activeScreenShares, setActiveScreenShares] = useState(0);
  const [isScreenFullscreen, setIsScreenFullscreen] = useState(false);
  const [isSessionFullscreen, setIsSessionFullscreen] = useState(false);
  const bindScreenVideo = useCallback((node) => {
    screenRef.current = node;
    attachVideoStream(node, receivedStreams.current.screen);
  }, []);
  const bindCameraVideo = useCallback((node) => {
    cameraRef.current = node;
    attachVideoStream(node, receivedStreams.current.camera);
  }, []);
  useEffect(() => {
    if (student.status !== "approved") {
      const notReady = student.status === "awaiting-review" ? "Waiting for approval" : "Not started";
      setScreenState(notReady); setCameraState(notReady); return;
    }
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${wsProto}//${location.host}/signaling?sessionId=${sessionId}&studentId=${student.id}`);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const queuedCandidates = [];
    let streamIds = {};
    let greetingTimer;
    pc.onicecandidate = (event) => { if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate })); };
    pc.ontrack = (event) => {
      const settings = event.track.getSettings();
      const streamId = event.streams[0]?.id;
      const screenTrack = streamIds.screen === streamId || Boolean(settings.displaySurface) || /screen|display|window|tab/i.test(event.track.label);
      const mediaStream = event.streams[0];
      event.track.onended = () => {
        if (screenTrack) {
          setScreenState("Feed stopped");
          setActiveScreenShares(0);
          receivedStreams.current.screen = null;
        } else setCameraState("Feed stopped");
      };
      if (screenTrack) {
        receivedStreams.current.screen = mediaStream;
        setActiveScreenShares(mediaStream?.getVideoTracks().some((track) => track.readyState === "live") ? 1 : 0);
        attachVideoStream(screenRef.current, mediaStream);
      } else {
        receivedStreams.current.camera = mediaStream;
        attachVideoStream(cameraRef.current, mediaStream);
      }
      setRetrying(false);
      if (screenTrack) setScreenState("Live feed"); else setCameraState("Live feed");
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (receivedStreams.current.screen?.getVideoTracks().some((track) => track.readyState === "live")) setScreenState("Live feed");
        if (receivedStreams.current.camera?.getVideoTracks().some((track) => track.readyState === "live")) setCameraState("Live feed");
        setRetrying(false);
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        if (receivedStreams.current.screen?.getVideoTracks().some((track) => track.readyState === "live")) setScreenState("Reconnecting");
        else setScreenState("Feed unavailable");
        if (receivedStreams.current.camera?.getVideoTracks().some((track) => track.readyState === "live")) setCameraState("Reconnecting");
        else setCameraState("Feed unavailable");
      }
    };
    socket.onopen = () => { signalingRef.current = socket; socket.send(JSON.stringify({ type: "lecturer-ready" })); greetingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "lecturer-ready" })); }, 1200); };
    socket.onclose = () => { if (signalingRef.current === socket) signalingRef.current = null; };
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "student-ready") {
        const nextIds = { camera: message.cameraStreamId, screen: message.screenStreamId };
        const tracksChanged = nextIds.camera !== streamIds.camera || nextIds.screen !== streamIds.screen;
        streamIds = nextIds;
        if (tracksChanged && !receivedStreams.current.screen) setScreenState("Connecting");
        if (tracksChanged && !receivedStreams.current.camera) setCameraState("Connecting");
      }
      if (message.type === "offer") {
        await pc.setRemoteDescription(message.offer);
        for (const candidate of queuedCandidates.splice(0)) await pc.addIceCandidate(candidate);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.send(JSON.stringify({ type: "answer", answer }));
      } else if (message.type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(message.candidate); else queuedCandidates.push(message.candidate);
      }
    };
    return () => { clearInterval(greetingTimer); if (signalingRef.current === socket) signalingRef.current = null; socket.close(); pc.close(); };
  }, [sessionId, student.id, student.status]);
  useEffect(() => {
    const updateFullscreenState = () => {
      setIsScreenFullscreen(document.fullscreenElement === screenTileRef.current);
      setIsSessionFullscreen(document.fullscreenElement === sessionFeedsRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);
  async function toggleScreenFullscreen() {
    try {
      if (document.fullscreenElement === screenTileRef.current) await document.exitFullscreen();
      else await screenTileRef.current?.requestFullscreen();
    } catch {
      setScreenState("Fullscreen unavailable");
    }
  }
  async function toggleSessionFullscreen() {
    try {
      if (document.fullscreenElement === sessionFeedsRef.current) await document.exitFullscreen();
      else await sessionFeedsRef.current?.requestFullscreen();
    } catch {
      setCameraState("Fullscreen unavailable");
    }
  }
  function retryFeeds() {
    const socket = signalingRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setScreenState("Waiting for student connection");
      setCameraState("Waiting for student connection");
      return;
    }
    setRetrying(true);
    setScreenState("Retry requested");
    setCameraState("Retry requested");
    socket.send(JSON.stringify({ type: "retry-media" }));
    window.setTimeout(() => {
      setRetrying(false);
      setScreenState((state) => state === "Retry requested" ? "No feed received" : state);
      setCameraState((state) => state === "Retry requested" ? "No feed received" : state);
    }, 8000);
  }
  return <><div className="media-grid" ref={sessionFeedsRef}><div className="media-tile" key="screen"><div className="media-title"><Monitor size={14}/> Shared screen<span className="media-live"><i />{screenState}</span></div><div className="media-frame" ref={screenTileRef}>{screenState === "Live feed" ? <video ref={bindScreenVideo} autoPlay playsInline muted /> : <div className="media-placeholder"><Monitor size={24}/><span>{screenState}</span></div>}<button className="fullscreen-feed-button" type="button" onClick={toggleScreenFullscreen} disabled={!receivedStreams.current.screen}><Maximize2 size={14}/>{isScreenFullscreen ? "Exit full screen" : "Full screen"}</button></div></div><div className="media-tile" key="camera"><div className="media-title"><Video size={14}/> Webcam<span className="media-live"><i />{cameraState}</span></div><div className="media-frame">{cameraState === "Live feed" ? <video ref={bindCameraVideo} autoPlay playsInline muted /> : <div className="media-placeholder"><Video size={24}/><span>{cameraState}</span></div>}</div></div>{isSessionFullscreen && <button className="fullscreen-session-exit" type="button" onClick={toggleSessionFullscreen}>Exit full session view</button>}</div><div className="screen-share-summary"><Monitor size={14}/><strong>{activeScreenShares}</strong> active feed{activeScreenShares === 1 ? "" : "s"} received in this session.{student.reportedDisplayCount ? ` Student reports ${student.reportedDisplayCount} display${student.reportedDisplayCount === "1" ? "" : "s"}.` : " Student display count not reported."}{student.reportedDisplay ? ` Declared shared display: ${student.reportedDisplay}.` : ""}{student.screenReady && student.screenSurface === "monitor" ? " Browser confirms the captured source is an entire-display surface." : " Browser has not confirmed an entire-display surface."}<span>Display count and selection are student-reported; browsers do not reveal other connected monitors.</span></div><div className="live-feed-actions"><span>Check the student's sharing connection if either feed is unavailable.</span><button className="button-secondary" onClick={toggleSessionFullscreen} disabled={activeScreenShares === 0}><Maximize2 size={14}/>{isSessionFullscreen ? "Exit full session view" : "Full session view"}</button><button className="button-secondary" onClick={retryFeeds} disabled={retrying || student.status !== "approved"}><RefreshCw size={14} className={retrying ? "retry-spin" : ""}/>{retrying ? "Checking feeds…" : "Check & retry feeds"}</button></div><div className="live-analysis-card"><Activity size={14}/><span><strong>On-device camera checks</strong>{latestCameraCue ? ` · ${eventTitle(latestCameraCue.type)}${latestCameraCue.payload?.faceCount != null ? ` (${latestCameraCue.payload.faceCount} detected)` : ""} · ${formatTime(latestCameraCue.timestamp)}` : " · Waiting for the first check"}. Face position/count cues are approximate and are not misconduct findings.</span></div></>;
}

function EventTimeline({ events }) {
  const ordered = [...events].reverse();
  return <div className="timeline-wrap">{ordered.length ? <div className="timeline">{ordered.map((event) => <div className="timeline-item" key={event.id}><div className={`timeline-icon ${event.type.includes("stop") || event.type.includes("warning") ? "attention" : ""}`}>{event.type.includes("screen") ? <Monitor size={14}/> : event.type.includes("camera") || event.type.includes("scan") ? <Webcam size={14}/> : <Activity size={14}/>}</div><div className="timeline-body"><strong>{eventTitle(event.type)}</strong><p>{event.payload?.message || event.payload?.detail || event.payload?.note || event.type.replaceAll("-", " ")}</p>{event.payload?.imageDataUrl && <img className="event-evidence" src={event.payload.imageDataUrl} alt="Shared-screen snapshot captured at event time"/>}</div><time>{formatTime(event.timestamp)}</time></div>)}</div> : <div className="no-evidence"><Activity size={18}/> No activity has been recorded yet.</div>}</div>;
}

function StudentJoin({ sessionId }) {
  const [session, setSession] = useState(null);
  const [student, setStudent] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [displayCount, setDisplayCount] = useState("1");
  const [selectedDisplay, setSelectedDisplay] = useState("Primary display");
  const [consented, setConsented] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [shots, setShots] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [faceMonitor, setFaceMonitor] = useState({ state: "idle", count: null, detail: "Local face-presence and position checks start after webcam access." });
  const cameraRef = useRef(null);
  const trackingVideoRef = useRef(null);
  const screenRef = useRef(null);
  const canvasRef = useRef(null);
  const stopFaceTrackingRef = useRef(null);
  const sessionEndRef = useRef(false);
  const bindCameraVideo = useCallback((node) => {
    cameraRef.current = node;
    attachVideoStream(node, cameraStream);
  }, [cameraStream]);
  const bindTrackingVideo = useCallback((node) => {
    trackingVideoRef.current = node;
    attachVideoStream(node, cameraStream);
  }, [cameraStream]);
  const bindScreenVideo = useCallback((node) => {
    screenRef.current = node;
    attachVideoStream(node, screenStream);
  }, [screenStream]);

  useEffect(() => { api(`/sessions/${sessionId}`).then(setSession).catch((err) => setError(err.message)); }, [sessionId]);
  useEffect(() => () => {
    if (!isViteHotUpdate()) cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);
  useEffect(() => () => {
    if (!isViteHotUpdate()) screenStream?.getTracks().forEach((track) => track.stop());
  }, [screenStream]);

  useEffect(() => {
    if (!student || !session || !["setup", "awaiting-review", "approved"].includes(student.status)) return;
    const interval = setInterval(async () => {
      try {
        const latest = await api(`/sessions/${session.id}`);
        const current = latest.students.find((entry) => entry.id === student.id);
        if (current) {
          setStudent(current);
          if (current.status === "ended") {
            sessionEndRef.current = true;
            cameraStream?.getTracks().forEach((track) => track.stop());
            screenStream?.getTracks().forEach((track) => track.stop());
          }
        }
      } catch { /* retry on next poll */ }
    }, 2500);
    return () => clearInterval(interval);
  }, [student?.id, student?.status, session?.id, cameraStream, screenStream]);

  useEffect(() => {
    if (!student || student.status !== "approved") return;
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${wsProto}//${location.host}/signaling?sessionId=${sessionId}&studentId=${student.id}`);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const queuedCandidates = [];
    let greetingTimer;
    let offerStarted = false;
    let negotiationRunning = false;
    cameraStream?.getTracks().forEach((track) => pc.addTrack(track, cameraStream));
    screenStream?.getTracks().forEach((track) => pc.addTrack(track, screenStream));
    pc.onicecandidate = (event) => { if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate })); };
    const announceStudent = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "student-ready", cameraStreamId: cameraStream?.id, screenStreamId: screenStream?.id })); };
    const sendOffer = async (iceRestart = false) => {
      if (negotiationRunning || socket.readyState !== WebSocket.OPEN) return;
      negotiationRunning = true;
      try {
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
        await pc.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: "offer", offer }));
      } finally {
        negotiationRunning = false;
      }
    };
    socket.onopen = () => { announceStudent(); greetingTimer = setInterval(announceStudent, 1200); };
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "lecturer-ready" && !offerStarted) {
        offerStarted = true;
        clearInterval(greetingTimer);
        await sendOffer();
      } else if (message.type === "retry-media") {
        await sendOffer(true);
      } else if (message.type === "answer") {
        await pc.setRemoteDescription(message.answer);
        for (const candidate of queuedCandidates.splice(0)) await pc.addIceCandidate(candidate);
      } else if (message.type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(message.candidate); else queuedCandidates.push(message.candidate);
      }
    };
    return () => { clearInterval(greetingTimer); socket.close(); pc.close(); };
  }, [student?.id, student?.status, sessionId, cameraStream, screenStream]);

  useEffect(() => {
    if (!student || !cameraStream) return;
    let cancelled = false;
    let stopTracking;
    const report = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, {
        method: "POST", body: JSON.stringify({ type, payload })
      }).then(() => setEventCount((count) => count + 1)).catch(() => {});
    };

    startFaceTracking(trackingVideoRef.current, (result) => {
      if (result.kind === "face-count") {
        setFaceMonitor({ state: result.count === 1 ? "present" : result.count === 0 ? "not-visible" : "multiple", count: result.count, detail: result.count === 1 ? "One face detected" : `${result.count} faces detected` });
        report("face-count-observed", { faceCount: result.count, note: "On-device face count cue; may be inaccurate and requires lecturer review." });
      } else if (result.kind === "face-position-change") {
        setFaceMonitor({ state: "movement", count: result.count, detail: "Face position changed" });
        report(result.kind, {
          faceCount: result.count,
          imageDataUrl: captureFrame(screenRef.current, canvasRef.current),
          message: "Face-position change cue detected; shared-screen snapshot captured for lecturer review.",
          note: "Coarse on-device face-position change; shared-screen snapshot captured at this instant. Not a behavior or misconduct finding."
        });
      } else if (result.kind === "face-position-settled") {
        setFaceMonitor({ state: "present", count: result.count, detail: "Face position settled" });
      } else {
        setFaceMonitor({ state: result.kind, count: result.count, detail: result.kind === "face-not-detected" ? "Face not visible across several checks" : result.kind === "multiple-faces-detected" ? "Multiple faces detected across several checks" : "Face visible again" });
        report(result.kind, { faceCount: result.count, note: "Automated camera cue; may be inaccurate and requires lecturer review." });
      }
    }, (state, error) => {
      if (cancelled) return;
      setFaceMonitor({ state, count: null, detail: state === "loading" ? "Starting local face-presence checks…" : error?.message || "Local face checks are unavailable." });
      if (state === "error") report("face-tracking-unavailable", { reason: error?.message || "Detector error" });
    }).then((cleanup) => {
      if (cancelled) cleanup?.(); else { stopTracking = cleanup; stopFaceTrackingRef.current = cleanup; }
    }).catch((error) => {
      if (cancelled) return;
      setFaceMonitor({ state: "error", count: null, detail: error.message || "Could not load local face detector." });
      report("face-tracking-unavailable", { reason: error.message || "Model could not be loaded" });
    });

    return () => { cancelled = true; stopTracking?.(); stopFaceTrackingRef.current = null; };
  }, [student?.id, sessionId, cameraStream]);

  useEffect(() => {
    if (student?.status === "ended") stopFaceTrackingRef.current?.();
  }, [student?.status]);

  useEffect(() => {
    if (!student || student.status !== "approved") return;
    const record = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type, payload }) }).catch(() => {});
      setEventCount((count) => count + 1);
    };
    record("assessment-monitoring-started");
    const onVisibility = () => { if (document.visibilityState === "hidden") record("session-tab-hidden", { detail: "The proctoring page became hidden." }); };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => record("monitoring-heartbeat", { cameraEnabled: Boolean(cameraStream?.active), screenEnabled: Boolean(screenStream?.active) }), 15000);
    return () => { document.removeEventListener("visibilitychange", onVisibility); clearInterval(timer); };
  }, [student?.id, student?.status, sessionId, cameraStream, screenStream]);

  async function join() {
    if (!studentName.trim() || !studentNumber.trim() || !consented) return;
    setBusy(true); setError("");
    try {
      const result = await api(`/sessions/${sessionId}/students`, { method: "POST", body: JSON.stringify({ studentName: studentName.trim(), studentNumber: studentNumber.trim() }) });
      setStudent(result);
      await api(`/sessions/${sessionId}/students/${result.id}`, { method: "PATCH", body: JSON.stringify({ consentAt: new Date().toISOString(), status: "setup" }) });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function enableCamera() {
    const issue = mediaCaptureIssue("getUserMedia");
    if (issue) { setError(issue); return; }
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      setCameraStream(stream);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (sessionEndRef.current) return;
        setCameraStream(null);
        setFaceMonitor({ state: "camera-stopped", count: null, detail: "Camera feed stopped. Re-enable it to resume local checks." });
        setError("Camera feed stopped. Re-enable your webcam to continue the monitored session.");
        api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ cameraReady: false }) }).catch(() => {});
        api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "webcam-feed-stopped" }) }).catch(() => {});
      }, { once: true });
      await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ cameraReady: true }) });
      await api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "webcam-enabled" }) });
    }
    catch (err) { setError(describeMediaError(err, "camera")); }
  }

  async function shareScreen() {
    const issue = mediaCaptureIssue("getDisplayMedia");
    if (issue) { setError(issue); return; }
    let stream;
    try {
      setError("");
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: 15 }, audio: false });
      const track = stream.getVideoTracks()[0];
      const surface = track?.getSettings().displaySurface;
      if (!isEntireDisplaySurface(surface)) {
        stream.getTracks().forEach((item) => item.stop());
        setScreenStream(null);
        await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ screenReady: false, screenSurface: surface || "unknown" }) });
        setError(surface ? "Please choose Entire Screen in the browser picker. Window and browser-tab sharing are not accepted." : "This browser cannot confirm that the entire screen is being shared. Use a supported browser that reports display surface type.");
        return;
      }
      setScreenStream(stream);
      track.addEventListener("ended", () => {
        if (sessionEndRef.current) return;
        const imageDataUrl = captureFrame(screenRef.current, canvasRef.current);
        setScreenStream(null);
        setError("Screen sharing stopped. Share your entire screen again to continue.");
        api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ screenReady: false, screenSurface: null }) }).catch(() => {});
        api(`/sessions/${sessionId}/students/${student.id}/events`, {
          method: "POST",
          body: JSON.stringify({ type: "screen-sharing-stopped", payload: { message: "Student screen sharing stopped.", imageDataUrl } })
        }).catch(() => {});
      }, { once: true });
      await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({
        screenReady: true,
        screenSurface: surface,
        reportedDisplayCount: displayCount,
        reportedDisplay: selectedDisplay
      }) });
      await api(`/sessions/${sessionId}/students/${student.id}/events`, {
        method: "POST",
        body: JSON.stringify({ type: "full-screen-sharing-started", payload: {
          displaySurface: surface,
          reportedDisplayCount: displayCount,
          reportedDisplay: selectedDisplay
        } })
      });
    } catch (err) {
      stream?.getTracks().forEach((item) => item.stop());
      setError(describeMediaError(err, "screen"));
    }
  }

  function capture(label) {
    const imageDataUrl = captureFrame(cameraRef.current, canvasRef.current);
    if (!imageDataUrl) { setError("Camera is not ready to capture an image yet."); return; }
    setShots((old) => ({ ...old, [label]: { label, imageDataUrl, timestamp: new Date().toISOString() } }));
  }

  async function submitScan() {
    if (Object.keys(shots).length < 3 || !cameraStream || !screenStream) return;
    setBusy(true); setError("");
    try {
      const result = await api(`/sessions/${sessionId}/students/${student.id}/precheck`, { method: "POST", body: JSON.stringify({ shots: ["left", "center", "right"].map((label) => shots[label]) }) });
      setStudent(result); setSaved(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function endSession() {
    if (!student) return;
    try { await api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "student-ended-session" }) }); await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) }); } catch { /* local exit still works */ }
    sessionEndRef.current = true;
    cameraStream?.getTracks().forEach((track) => track.stop()); screenStream?.getTracks().forEach((track) => track.stop());
    location.href = "/";
  }

  if (error && !session) return <StudentShell><div className="student-error"><ShieldAlert size={26}/><h2>We couldn’t open this assessment</h2><p>{error}</p><a className="button-secondary" href="/">Return to home</a></div></StudentShell>;
  if (!session) return <StudentShell><div className="student-loading">Loading assessment details…</div></StudentShell>;
  if (session.status !== "live") return <StudentShell><div className="student-error"><Clock3 size={26}/><h2>This assessment isn’t open</h2><p>Ask your lecturer if you think you should have access.</p></div></StudentShell>;

  if (!student) return <StudentShell><div className="student-join-card"><div className="student-symbol"><GraduationCap size={22}/></div><div className="eyebrow">ASSESSMENT INVITATION</div><h1>{session.title}</h1><p className="student-intro">Hosted by {session.lecturerName}. Join to complete your device check and request access to begin.</p><div className="privacy-callout"><LockKeyhole size={17}/><span>Your lecturer will see your screen and webcam only after you choose to share them. You can stop sharing anytime.</span></div><label className="field-label">Your name<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="First and last name" /></label><label className="field-label">Student number<input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="Your class ID" /></label><label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I understand my lecturer can view the screen and webcam I choose to share during the approved session. While my webcam is enabled, approximate face-presence/count and coarse face-position checks run locally on my device. These cues may be inaccurate and are not misconduct findings. Background images and session activity are logged. When the local face-position check detects a change, a screenshot of the shared screen may be captured for the session log and lecturer review. This is an approximate face-position cue, not a full-body movement or misconduct determination.</span></label>{error && <div className="form-error">{error}</div>}<button className="button-primary full-button" onClick={join} disabled={busy || !studentName.trim() || !studentNumber.trim() || !consented}>{busy ? "Joining…" : "Continue to device check"}<ArrowRight size={16}/></button><div className="student-safe-note"><ShieldCheck size={14}/> Permission is requested by your browser, not granted silently.</div></div></StudentShell>;

  const allShots = Object.keys(shots).length === 3;
  const isApproved = student.status === "approved";
  return <StudentShell><div className="student-workspace"><div className="student-topline"><a className="student-brand" href="/"><span className="brand-mark"><ShieldCheck size={17}/></span>verity<span className="brand-dot">.</span></a><div className="student-session-tag"><span className={`secure-dot ${isApproved ? "" : "amber-dot"}`}/>{isApproved ? "Proctoring active" : "Pre-assessment check"}</div><button className="student-exit" onClick={endSession}><LogOut size={15}/> Exit</button></div>
    <div className="student-main"><div className="student-progress"><span className="done"><Check size={12}/> Join</span><i/><span className={student.status !== "setup" ? "done" : "current"}>{student.status !== "setup" ? <Check size={12}/> : "2"} Setup</span><i/><span className={isApproved ? "done" : student.status === "awaiting-review" ? "current" : ""}>{isApproved ? <Check size={12}/> : "3"} Review</span><i/><span className={isApproved ? "current" : ""}>Quiz</span></div>
      {student.status === "ended" ? <div className="awaiting-card"><div className="waiting-icon"><CheckCircle2 size={24}/></div><div className="eyebrow">SESSION CLOSED</div><h1>This assessment has ended</h1><p>Your camera and screen sharing have been stopped. Contact your lecturer if you need help.</p></div> : isApproved ? <div className="approved-view">{error && <div className="form-error student-form-error"><ShieldAlert size={15}/><span>{error}</span><button className="button-secondary" onClick={screenStream ? shareScreen : enableCamera}>{screenStream ? "Share entire screen again" : "Enable webcam"}</button></div>}<div className="approval-success"><div className="success-ring"><CheckCircle2 size={31}/></div><div className="eyebrow">YOU’RE ALL SET</div><h1>Session approved</h1><p>Your lecturer has approved your setup. Keep this tab open and leave screen sharing enabled during your quiz.</p></div><div className="live-preview-grid"><div className="live-preview-card"><div><Monitor size={15}/> Shared screen <span className="live-label"><i/>LIVE</span></div><video ref={bindScreenVideo} autoPlay playsInline muted /></div><div className="live-preview-card"><div><Video size={15}/> Webcam <span className="live-label"><i/>LIVE</span></div><video ref={bindCameraVideo} autoPlay playsInline muted /></div></div><div className="monitoring-card"><div className="monitoring-symbol"><Activity size={19}/></div><div><strong>Monitoring is active</strong><span>Your lecturer can see the live webcam and full-screen feeds. Approximate face presence/count and coarse face-position checks run locally on your device and are not misconduct findings.</span></div><span className="event-counter">{eventCount} events</span></div><div className="student-quiz-note"><BookOpen size={17}/><span><strong>Ready for your quiz?</strong><br/>Open your quiz in a new tab or window. Keep screen sharing active.</span><ArrowUpRight size={16}/></div><button className="button-secondary full-button end-button" onClick={endSession}>End monitored session</button></div> : student.status === "awaiting-review" ? <div className="awaiting-card"><div className="waiting-icon"><Clock3 size={24}/></div><div className="eyebrow">SETUP SUBMITTED</div><h1>Waiting for your lecturer</h1><p>Your background check has been submitted. Your lecturer will review it before you can start.</p><div className="waiting-progress"><span/><span/><span className="pulse-dot"/></div><small>This page will update automatically after the review.</small></div> : <div className="setup-content"><div className="setup-intro"><div className="eyebrow">STEP 2 OF 4 · DEVICE CHECK</div><h1>Set up your space</h1><p>Enable your webcam and choose the entire display you’ll use for the quiz. The browser picker should be set to share the full screen, not a window or tab. While the webcam is enabled, approximate face-presence/count and coarse face-position checks run locally on your device. These cues may be inaccurate and are not misconduct findings.</p></div><div className="device-grid"><div className={`device-card ${cameraStream ? "device-ready" : ""}`}><div className="device-card-head"><div className="device-icon"><Video size={18}/></div><span className={cameraStream ? "device-status ready" : "device-status"}><i/>{cameraStream ? "Enabled" : "Not enabled"}</span></div><h3>Webcam</h3><p>Allow camera access so your lecturer can see you during the assessment and on-device face-presence/count checks can run.</p>{cameraStream ? <div className="mini-video"><video ref={bindCameraVideo} autoPlay playsInline muted/><span><CheckCircle2 size={13}/> Camera preview</span></div> : <button className="button-secondary device-button" onClick={enableCamera}><Video size={15}/> Enable webcam</button>}</div><div className={`device-card ${screenStream ? "device-ready" : ""}`}><div className="device-card-head"><div className="device-icon screen-icon"><Monitor size={18}/></div><span className={screenStream ? "device-status ready" : "device-status"}><i/>{screenStream ? "Entire screen shared" : "Not sharing"}</span></div><h3>Entire screen</h3><p>Choose the entire display where you’ll complete your quiz. Browser tabs and individual windows won’t be accepted.</p>{!screenStream && <div className="display-declaration"><label className="field-label">Displays in your setup (self-reported)<select value={displayCount} onChange={(event) => { setDisplayCount(event.target.value); setSelectedDisplay("Primary display"); }}><option value="1">1 display</option><option value="2">2 displays</option><option value="3">3 displays</option><option value="4+">4 or more displays</option></select></label><label className="field-label">Display you plan to share<select value={selectedDisplay} onChange={(event) => setSelectedDisplay(event.target.value)}><option>Primary display</option>{Array.from({ length: displayCount === "4+" ? 3 : Math.max(0, Number(displayCount) - 1) }, (_, index) => <option key={index}>External display {index + 1}</option>)}{displayCount === "4+" && <option>External display 4+</option>}</select></label><small>Browsers do not reveal the number or names of connected monitors; this is your declaration.</small></div>}{screenStream ? <div className="mini-video"><video ref={bindScreenVideo} autoPlay playsInline muted/><span><CheckCircle2 size={13}/> Screen preview</span></div> : <button className="button-secondary device-button" onClick={shareScreen}><Monitor size={15}/> Share entire screen</button>}</div></div>
        <div className="camera-analysis-card"><div className="analysis-indicator"><span className={`analysis-pulse ${faceMonitor.state === "present" ? "on" : ""}`}/><div><strong>{cameraStream ? "Camera checks active" : "Camera checks not started"}</strong><span>{cameraStream ? faceMonitor.detail : "Checks start when webcam access is enabled."}</span></div></div><span className="analysis-local">ON DEVICE</span></div>
        <div className="scan-card"><div className="scan-card-heading"><div><div className="eyebrow">WORKSPACE CHECK</div><h2>Show your surroundings</h2><p>Use your webcam to capture left, center, and right views of your workspace.</p></div><div className="scan-count">{Object.keys(shots).length}<span>/3</span></div></div><div className="scan-capture-row">{[{ key: "left", label: "Left side", icon: <ArrowDownLeft size={16}/> }, { key: "center", label: "Straight ahead", icon: <UserRound size={16}/> }, { key: "right", label: "Right side", icon: <ArrowDownLeft className="flip-icon" size={16}/> }].map((item) => <button className={`capture-tile ${shots[item.key] ? "captured" : ""}`} key={item.key} disabled={!cameraStream} onClick={() => capture(item.key)}>{shots[item.key] ? <img src={shots[item.key].imageDataUrl} alt={`${item.label} scan`}/> : <span className="capture-placeholder">{item.icon}</span>}<span className="capture-label">{shots[item.key] ? <CheckCircle2 size={13}/> : null}{item.label}</span></button>)}</div><div className="scan-hint"><Eye size={15}/> Make sure your webcam can see the area around you. Images are shared with your lecturer for review.</div></div>
        {error && <div className="form-error student-form-error"><ShieldAlert size={15}/><span>{error}</span>{!cameraStream && <button className="button-secondary" onClick={enableCamera}>Enable webcam</button>}{!screenStream && <button className="button-secondary" onClick={shareScreen}>Share entire screen</button>}</div>}
        <div className="setup-footer"><div><LockKeyhole size={15}/><span>Camera and screen access can be stopped in your browser at any time.</span></div><button className="button-primary" onClick={submitScan} disabled={busy || !cameraStream || !screenStream || !allShots}>{busy ? "Submitting…" : "Submit setup for review"}<ArrowRight size={16}/></button></div></div>}
    </div><footer className="student-footer"><span><ShieldCheck size={14}/> Verity · Assessment workspace</span><a href="#" onClick={(event) => { event.preventDefault(); alert("Contact your lecturer for help with this assessment."); }}>Need help?</a></footer><video ref={trackingVideoRef} className="tracking-video" autoPlay playsInline muted/><canvas ref={canvasRef} width="720" height="405" hidden/></div></StudentShell>;
}

function StudentShell({ children }) { return <div className="student-shell">{children}</div>; }

function StatusPill({ status }) {
  const cls = status === "live" || status === "approved" ? "status-live" : status === "awaiting-review" ? "status-review" : status === "ended" ? "status-ended" : "status-setup";
  return <span className={`status-pill ${cls}`}><i/>{status === "live" ? "Live" : statusLabel(status)}</span>;
}
function StatusDot({ status }) { return <span className={`status-dot ${status === "awaiting-review" ? "needs" : status === "approved" ? "approved" : ""}`} title={statusLabel(status)} />; }
function initials(name = "") { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function eventTitle(type) { return ({ "assessment-monitoring-started": "Monitoring started", "monitoring-heartbeat": "Session active", "screen-sharing-stopped": "Screen sharing stopped", "session-tab-hidden": "Proctoring tab changed", "background-scan-submitted": "Background scan submitted", "student-approved": "Student approved", "approval-withheld": "Review held", "student-ended-session": "Session ended", "face-count-observed": "On-device face count", "face-position-change": "Face position changed", "face-not-detected": "Face not visible", "multiple-faces-detected": "Multiple faces detected" }[type] || type.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase())); }
function captureFrame(video, canvas) {
  if (!video || !canvas || !video.videoWidth) return null;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.76);
}

function fallbackCopy(value) {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch { copied = false; }
  input.remove();
  return copied;
}

function mediaCaptureIssue(method) {
  const hostname = window.location.hostname;
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (!window.isSecureContext && !localHost) {
    return "Camera and screen access require HTTPS. For local testing, open http://localhost:5173/ (not the Network/LAN IP address). For deployment, use an HTTPS URL.";
  }
  if (!navigator.mediaDevices) {
    return "This page cannot access browser media devices. Open the app in a current Chrome or Edge browser using http://localhost:5173/ or HTTPS, then reload the page.";
  }
  if (typeof navigator.mediaDevices[method] !== "function") {
    return method === "getUserMedia"
      ? "This browser does not support webcam capture here. Use a current Chrome or Edge browser and allow camera access."
      : "This browser does not support screen sharing here. Use a current desktop Chrome or Edge browser over localhost or HTTPS.";
  }
  return "";
}

function describeMediaError(error, device) {
  const label = device === "camera" ? "webcam" : "entire-screen sharing";
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return `Browser permission for ${label} was denied or dismissed. Allow it in the browser prompt/site settings, then try again.`;
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return device === "camera" ? "No webcam was found. Connect or enable a camera, then try again." : "No display is available to share.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return `The ${label} is busy or unavailable. Close other apps using it and try again.`;
  }
  if (device === "screen" && error?.name === "InvalidStateError") {
    return "Screen sharing must be started directly from the button. Click Share entire screen again.";
  }
  return `${device === "camera" ? "Camera access" : "Full-screen sharing"} could not start: ${error?.message || "Unknown browser error"}`;
}

function attachVideoStream(video, stream) {
  if (!video) return;
  if (stream && video.srcObject !== stream) video.srcObject = stream;
  if (!stream && video.srcObject) video.srcObject = null;
  if (stream) video.play().catch(() => {});
}
