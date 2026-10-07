import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Copy, ExternalLink,
  Eye, FileText, Fingerprint, GraduationCap, Grid2X2, Laptop, Link2, LockKeyhole,
  LogOut, Maximize2, Menu, Monitor, Moon, MoreHorizontal, Plus, Radio, RefreshCw, Search, Shield,
  ShieldCheck, ShieldAlert, Sparkles, UserRound, Users, Video, Webcam, X
} from "lucide-react";
import { startFaceTracking } from "./faceTracker.js";
import { analyzeBackgroundVideo } from "./backgroundObjectTracker.js";
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

function mergeSessionSummary(summary, previous) {
  if (!summary) return null;
  const previousStudents = new Map((previous?.students || []).map((student) => [student.id, student]));
  return {
    ...summary,
    students: summary.students.map((student) => {
      const previousStudent = previousStudents.get(student.id);
      const previousEvents = new Map((previousStudent?.events || []).map((event) => [event.id, event]));
      return {
        ...student,
        precheckVideo: previousStudent?.precheckVideo || null,
        events: student.events.map((event) => {
          const oldEvent = previousEvents.get(event.id);
          return oldEvent?.payload?.imageDataUrl
            ? { ...event, payload: { ...event.payload, imageDataUrl: oldEvent.payload.imageDataUrl } }
            : event;
        })
      };
    })
  };
}

let preserveMediaDuringHotUpdateUntil = 0;
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", () => { preserveMediaDuringHotUpdateUntil = Date.now() + 5000; });
  import.meta.hot.on("vite:afterUpdate", () => { preserveMediaDuringHotUpdateUntil = Date.now() + 5000; });
}
const isViteHotUpdate = () => Boolean(import.meta.hot && Date.now() < preserveMediaDuringHotUpdateUntil);

const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const statusLabel = (status) => ({ setup: "Setting up", "awaiting-review": "Needs review", "changes-requested": "Retry requested", approved: "In progress", ended: "Completed" }[status] || status);

export default function App() {
  const joinId = new URLSearchParams(location.search).get("join");
  return joinId ? <StudentJoin sessionId={joinId} /> : <LecturerDashboard />;
}

function LecturerDashboard() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [activePage, setActivePage] = useState("overview");
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("proctor-buddy-theme") || "light");
  const [permissions, setPermissions] = useState({
    viewLiveFeeds: true,
    exportReports: true,
    approveStudents: true,
    requestRetry: true
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);

  const refresh = useCallback(async (includeDetails = false) => {
    try {
      const data = await api("/sessions");
      setSessions(data);
      const id = selectedId || data[0]?.id;
      if (id) {
        setSelectedId(id);
        const summary = data.find((item) => item.id === id);
        const nextSession = includeDetails
          ? await api(`/sessions/${id}`)
          : mergeSessionSummary(summary, sessionRef.current);
        sessionRef.current = nextSession;
        setSession(nextSession);
      } else setSession(null);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);
  useEffect(() => { refresh(true); const timer = setInterval(() => refresh(false), 3000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    document.body.classList.toggle("theme-dark", theme === "dark");
    localStorage.setItem("proctor-buddy-theme", theme);
  }, [theme]);

  const filtered = sessions.filter((item) => {
    const reportIndex = [
      item.title,
      item.lecturerName,
      ...(item.students || []).map((student) => `${student.studentName} ${student.studentNumber} ${(student.events || []).length} ${student.status}`)
    ].join(" ").toLowerCase();
    return reportIndex.includes(search.toLowerCase());
  });
  const students = session?.students || [];
  const needsReview = students.filter((student) => student.status === "awaiting-review").length;
  const active = students.filter((student) => student.status === "approved").length;
  const pageLabel = ({
    overview: "Overview",
    "live-sessions": "Live sessions",
    settings: "Settings",
    profile: "Profile"
  }[activePage] || "Overview");

  async function createSession(data) {
    const created = await api("/sessions", { method: "POST", body: JSON.stringify(data) });
    setSessions((old) => [created, ...old]);
    setSelectedId(created.id);
    sessionRef.current = created;
    setSession(created);
    setShowCreate(false);
    setToast("Assessment session created");
  }

  async function selectSession(sessionId) {
    setSelectedId(sessionId);
    try {
      const details = await api(`/sessions/${sessionId}`);
      sessionRef.current = details;
      setSession(details);
    } catch (error) {
      setToast(error.message);
    }
  }

  async function approveStudent(studentId, approved, message, review) {
    if (!permissions.approveStudents || (!approved && !permissions.requestRetry)) {
      setToast("Your current permission settings do not allow this review action.");
      return;
    }
    await api(`/sessions/${session.id}/students/${studentId}/approval`, {
      method: "PATCH", body: JSON.stringify({ approved, reviewer: "Learning Coach", message, ...review })
    });
    await refresh(true);
    setToast(approved ? "Student approved to begin" : "Retry requested with personalized guidance");
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
    await refresh(true);
    setToast("Assessment ended. Reports remain available.");
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={19} /></div><span>Proctor Buddy</span><span className="brand-tag">ASSESS</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className={`nav-item ${activePage === "overview" ? "active" : ""}`} onClick={() => setActivePage("overview")}><Grid2X2 size={17} /> Overview</button>
        <button className={`nav-item ${activePage === "live-sessions" ? "active" : ""}`} onClick={() => setActivePage("live-sessions")}><Radio size={17} /> Live sessions <span className="nav-count">{sessions.length}</span></button>
        <button className={`nav-item ${activePage === "settings" ? "active" : ""}`} onClick={() => setActivePage("settings")}><Shield size={17} /> Settings</button>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><span>Visit the proctor guide</span><ArrowUpRight size={15} /></div>
          <div className={`profile profile-button ${activePage === "profile" ? "profile-active" : ""}`} role="button" tabIndex={0} onClick={() => setActivePage("profile")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActivePage("profile"); } }}><div className="avatar lecturer-avatar">LC</div><div className="profile-copy"><strong>Learning Coach</strong><span>Lecturer account</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><button className="sidebar-toggle-button" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)}><Menu size={17} /></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageLabel}</strong></div><div className="topbar-actions"><div className="secure-pill"><span className="secure-dot" /> Secure workspace</div><button className="icon-button" aria-label="Notifications" onClick={() => setToast("You’re all caught up.")}><Bell size={18} /><i /></button><div className="avatar lecturer-avatar small">LC</div></div></header>
        <div className="page-content">
          {activePage === "overview" && <>
            <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={13} /> YOUR ASSESSMENT SPACE</div><h1>Good morning, Herve <span className="wave">✳</span></h1><p className="subhead">A clear view of your assessments and the students in them.</p></div><button className="button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> New assessment</button></div>
            <section className="metric-grid">
              <Metric label="Live assessments" value={sessions.filter((item) => item.status === "live").length} note="Across your workspace" icon={<Radio size={17} />} accent="green" />
              <Metric label="Students in progress" value={active} note="Currently approved" icon={<Users size={17} />} accent="blue" />
              <Metric label="Awaiting your review" value={needsReview} note={needsReview ? "Action recommended" : "Nothing needs attention"} icon={<ShieldAlert size={17} />} accent={needsReview ? "amber" : "lilac"} />
            </section>
            <section className="workspace-overview-grid">
              <div className="overview-card"><strong>Quick actions</strong><button className="button-secondary" onClick={() => setActivePage("live-sessions")}><Radio size={14}/> Open live sessions</button><button className="button-secondary" onClick={() => setShowCreate(true)}><Plus size={14}/> Create assessment</button><button className="button-secondary" onClick={() => setActivePage("settings")}><Shield size={14}/> Open settings</button></div>
              <div className="overview-card"><strong>Workspace status</strong><p>{sessions.length} total session{sessions.length === 1 ? "" : "s"} available. Use Live sessions to search assessments and report activity by student.</p></div>
            </section>
          </>}

          {activePage === "live-sessions" && <>
            <section className="session-section">
              <div className="section-heading"><div><h2>All sessions and reports</h2><p>Search assessments and report activity across every session.</p></div><button className="button-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button></div>
              <div className="session-tabs"><button className="tab active">All sessions <span>{sessions.length}</span></button><button className="tab" onClick={() => setToast("Use search to find report activity by student or session.")}>Reports included</button><div className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions, students, or reports" /></div></div>
              <div className="session-table-wrap">
                <table className="session-table"><thead><tr><th>ASSESSMENT</th><th>STATUS</th><th>STUDENTS</th><th>REPORT EVENTS</th><th>STARTED</th><th /></tr></thead>
                  <tbody>{loading ? <tr><td colSpan="6" className="empty-row">Loading sessions…</td></tr> : filtered.length ? filtered.map((item) => <tr className={selectedId === item.id ? "selected-row" : ""} key={item.id} onClick={() => selectSession(item.id)}><td><div className="assessment-cell"><div className="assessment-icon"><BookOpen size={17} /></div><div><strong>{item.title}</strong><span>Hosted by {item.lecturerName}</span></div></div></td><td><StatusPill status={item.status} /></td><td><div className="student-stack">{(item.students || []).slice(0, 3).map((student, index) => <div className={`avatar student-avatar color-${index % 4}`} key={student.id}>{initials(student.studentName)}</div>)}<span>{item.students?.length || 0} joined</span></div></td><td className="time-cell">{(item.students || []).reduce((total, student) => total + (student.events?.length || 0), 0)}</td><td className="time-cell">{formatTime(item.createdAt)}</td><td><button className="row-arrow" aria-label="Select session"><ArrowRight size={16} /></button></td></tr>) : <tr><td colSpan="6" className="empty-row"><div className="empty-state"><div className="empty-icon"><BookOpen size={22} /></div><strong>No matching sessions</strong><span>Try a broader report search term.</span></div></td></tr>}</tbody>
                </table>
              </div>
            </section>
            {session && <SessionDetail session={session} onCopy={copyJoinLink} joinLink={`${location.origin}/?join=${session.id}`} copyFailed={copyFailed} onApprove={approveStudent} onRefresh={refresh} onEnd={endAssessment} permissions={permissions} />}
          </>}

          {activePage === "settings" && <SettingsPanel theme={theme} setTheme={setTheme} permissions={permissions} setPermissions={setPermissions} />}

          {activePage === "profile" && <ProfilePanel />}

          <footer className="page-footer"><span><LockKeyhole size={13} /> Student permission is always required for camera and screen access.</span><span>Proctor Buddy MVP <span className="footer-sep">·</span> Local prototype</span></footer>
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

function SettingsPanel({ theme, setTheme, permissions, setPermissions }) {
  const toggle = (key) => setPermissions((current) => ({ ...current, [key]: !current[key] }));
  return <section className="settings-panel"><div className="section-heading"><div><h2>Settings</h2><p>Theme, permissions, and workspace rights.</p></div></div><div className="settings-grid"><div className="settings-card"><h3>Appearance</h3><p>Choose how your workspace looks.</p><div className="theme-toggle-row"><button className={`button-secondary ${theme === "light" ? "selected-theme" : ""}`} onClick={() => setTheme("light")}><Sparkles size={14}/> Light mode</button><button className={`button-secondary ${theme === "dark" ? "selected-theme" : ""}`} onClick={() => setTheme("dark")}><Moon size={14}/> Dark mode</button></div></div><div className="settings-card"><h3>Permission settings</h3><p>Control what this lecturer workspace can do.</p><label className="switch-row"><input type="checkbox" checked={permissions.viewLiveFeeds} onChange={() => toggle("viewLiveFeeds")} /><span>Allow live-feed viewing rights</span></label><label className="switch-row"><input type="checkbox" checked={permissions.exportReports} onChange={() => toggle("exportReports")} /><span>Allow exporting report files</span></label><label className="switch-row"><input type="checkbox" checked={permissions.approveStudents} onChange={() => toggle("approveStudents")} /><span>Allow approving students into quizzes</span></label><label className="switch-row"><input type="checkbox" checked={permissions.requestRetry} onChange={() => toggle("requestRetry")} /><span>Allow retry requests with custom guidance</span></label></div><div className="settings-card"><h3>Rights summary</h3><p>Current role: Learning Coach</p><ul className="rights-list"><li><ShieldCheck size={13}/> Manage assessment sessions</li><li><ShieldCheck size={13}/> Review setup evidence and approve/retry</li><li><ShieldCheck size={13}/> Access monitoring metrics and logs</li><li><ShieldCheck size={13}/> Export session and movement reports</li></ul></div></div></section>;
}

function ProfilePanel() {
  return <section className="settings-panel"><div className="section-heading"><div><h2>Profile</h2><p>About this lecturer account.</p></div></div><div className="profile-page-card"><div className="avatar lecturer-avatar large">LC</div><h3>Learning Coach</h3><p>Proctor Buddy lecturer workspace owner.</p><div className="profile-about"><strong>About</strong><p>This profile manages live assessments, setup review decisions, monitoring oversight, and reporting access for students in active sessions.</p></div></div></section>;
}

function CreateSessionModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [lecturerName, setLecturerName] = useState("Learning Coach");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onCreate({ title: title.trim(), lecturerName: lecturerName.trim() }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal-card" onSubmit={submit}><div className="modal-top"><div className="modal-symbol"><Plus size={19} /></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><h2>Start an assessment</h2><p>Create a monitored session, then share its private join link with your class.</p><label className="field-label">Assessment name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Biology · Unit 4 quiz" required /></label><label className="field-label">Lecturer name<input value={lecturerName} onChange={(event) => setLecturerName(event.target.value)} required /></label>{error && <div className="form-error">{error}</div>}<div className="modal-foot"><span><Shield size={14} /> Students choose to enable each device.</span><button className="button-primary" disabled={busy}>{busy ? "Creating…" : "Create session"}<ArrowRight size={16} /></button></div></form></div>;
}

function SessionDetail({ session, onCopy, onApprove, onRefresh, onEnd, joinLink, copyFailed, permissions }) {
  const students = session.students || [];
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || null);
  const selected = students.find((student) => student.id === selectedStudentId) || students[0] || null;
  useEffect(() => { if (!students.find((student) => student.id === selectedStudentId)) setSelectedStudentId(students[0]?.id || null); }, [students, selectedStudentId]);
  function buildMovementLog(student) {
    return (student.events || []).map((event) => ({
      timestamp: event.timestamp,
      eventType: event.type,
      title: eventTitle(event.type),
      severity: eventSeverity(event.type),
      message: event.payload?.message || event.payload?.detail || event.payload?.note || event.type.replaceAll("-", " "),
      faceCount: event.payload?.faceCount ?? null
    }));
  }
  function downloadReport() {
    const report = {
      assessment: { id: session.id, title: session.title, lecturerName: session.lecturerName, status: session.status, createdAt: session.createdAt, endedAt: session.endedAt || null },
      exportedAt: new Date().toISOString(),
      students: session.students.map(({ id, studentName, studentNumber, status, consentAt, joinedAt, approvedAt, approvedBy, precheckVideo, precheckSummary, events }) => ({ id, studentName, studentNumber, status, consentAt, joinedAt, approvedAt, approvedBy, precheckVideo, precheckSummary, events, movementLog: buildMovementLog({ events }) }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `proctor-buddy-${session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function downloadMovementLog() {
    if (!selected) return;
    const movementLog = {
      assessment: { id: session.id, title: session.title },
      student: { id: selected.id, name: selected.studentName, studentNumber: selected.studentNumber },
      exportedAt: new Date().toISOString(),
      entries: buildMovementLog(selected)
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(movementLog, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `proctor-buddy-${selected.studentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-movement-log.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <section className="detail-section"><div className="section-heading detail-heading"><div><div className="eyebrow"><Radio size={12} /> {session.status === "live" ? "LIVE SESSION" : "COMPLETED SESSION"}</div><h2>{session.title}</h2><p>Started {new Date(session.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} <span className="bullet">·</span> {students.length} student{students.length === 1 ? "" : "s"} joined</p></div><div className="detail-actions">{session.status === "live" && <button className="button-secondary" onClick={onEnd}><X size={14} /> End assessment</button>}<button className="button-secondary" onClick={downloadReport} disabled={!permissions.exportReports}><FileText size={14} /> Export report</button>{selected && <button className="button-secondary" onClick={downloadMovementLog} disabled={!permissions.exportReports}><Activity size={14} /> Export movement log</button>}<button className="button-secondary" onClick={onCopy}><Link2 size={15} /> Copy join link</button><button className="button-primary compact" onClick={() => onRefresh(true)}><RefreshCw size={15} /> Update</button></div></div>
    <div className="join-banner"><div className="join-banner-icon"><Link2 size={18} /></div><div><strong>Invite students to join</strong><span>Anyone with this link can request access to this assessment.</span></div><button onClick={onCopy}><Copy size={15} /> Copy invite link</button></div>
    {copyFailed && <div className="manual-link-row"><label htmlFor="student-invite-link">Copy this student link manually</label><input id="student-invite-link" readOnly value={joinLink} onFocus={(event) => event.target.select()} onClick={(event) => event.target.select()} /><button className="button-secondary" onClick={() => { const field = document.getElementById("student-invite-link"); field?.focus(); field?.select(); }}>Select link</button></div>}
    {!students.length ? <div className="session-empty"><div className="empty-icon"><Users size={21} /></div><strong>Waiting for students to join</strong><span>Share the link above. Each student will have a separate review and activity log.</span></div> : <div className="detail-content"><div className="student-list"><div className="list-title">STUDENT SESSIONS <span>{students.length}</span></div>{students.map((student, index) => <button key={student.id} className={`student-list-item ${selected?.id === student.id ? "chosen" : ""}`} onClick={() => setSelectedStudentId(student.id)}><div className={`avatar student-avatar color-${index % 4}`}>{initials(student.studentName)}</div><span className="student-list-copy"><strong>{student.studentName}</strong><small>{student.studentNumber}</small></span><StatusDot status={student.status} /></button>)}</div>
      {selected ? <StudentReport session={session} student={selected} onApprove={onApprove} permissions={permissions} /> : null}</div>}
  </section>;
}

    function StudentReport({ session, student, onApprove, permissions }) {
  const [activeTab, setActiveTab] = useState("Overview");
  return <div className="report-panel"><div className="report-person"><div><div className="report-heading"><div className="avatar student-avatar color-2 large">{initials(student.studentName)}</div><div><h3>{student.studentName}</h3><span>{student.studentNumber} <span className="bullet">·</span> Joined {formatTime(student.joinedAt)}</span></div></div></div><StatusPill status={student.status} /></div>
    <div className="report-tabs">{["Overview", "Activity log"].map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}{tab === "Activity log" && <span>{student.events?.length || 0}</span>}</button>)}</div>
    {activeTab === "Overview" ? <>
      <section className="workspace-review-panel" aria-label="Review student's background evidence">
        <div className="evidence-heading"><div><h4>Review background before admission</h4><span>Check the submitted walkthrough video before deciding.</span></div><span className="evidence-count">{student.precheckVideo ? "Video submitted" : "Video pending"}</span></div>
        {student.precheckVideo?.dataUrl ? <div className="precheck-video-review"><video controls preload="metadata" playsInline src={student.precheckVideo.dataUrl}/><span>Student's short background walkthrough · use playback controls to inspect the full clip.</span></div> : <div className="no-evidence"><Webcam size={18}/> Student video has not been submitted.</div>}
        {student.precheckSummary && <div className="cv-summary"><strong>On-device face-cue summary</strong><span>{student.precheckSummary.faceFrames ?? 0} sampled checks · {student.precheckSummary.maxFaces ?? 0} maximum faces detected · {student.precheckSummary.positionChanges ?? 0} face-position changes. Approximate cues only; they do not determine room compliance. After approval, movement/activity cues are logged in the Activity log with suspicious (red) and okay (green) indicators.</span></div>}
        <div className="review-bar"><div className="review-bar-copy"><ShieldCheck size={17}/><span>{student.status === "awaiting-review" ? "Review the evidence and AI-assisted object cues before allowing the quiz to begin." : student.status === "approved" ? "Student has been approved for this session." : student.status === "changes-requested" ? "Retry requested; waiting for the student's updated scan." : "Student is completing their device setup."}</span></div></div>
        {student.status === "awaiting-review" && <ReviewDecision key={student.id} student={student} onDecide={onApprove} permissions={permissions}/>}
        {student.reviewMessage && <div className="review-message-preview"><strong>Last message to student</strong><p>{student.reviewMessage}</p></div>}
      </section>
      <LiveFeeds sessionId={session.id} student={student}/>
      <RealtimeMonitoringMetrics student={student} />
    </> : <EventTimeline events={student.events || []} />}
  </div>;
}

function RealtimeMonitoringMetrics({ student }) {
  const events = student.events || [];
  const suspicious = events.filter((event) => eventSeverity(event.type) === "suspicious").length;
  const okay = events.filter((event) => eventSeverity(event.type) === "ok").length;
  const headMovementFlags = events.filter((event) => ["camera-movement-suspicious", "movement-suspicious"].includes(event.type)).length;
  const eyeHeadShifts = events.filter((event) => ["camera-eye-head-shift-cue", "eye-head-shift-cue"].includes(event.type)).length;
  const lowLightFlags = events.filter((event) => ["camera-low-light-warning", "low-light-warning"].includes(event.type)).length;
  const screenSwitchCues = events.filter((event) => event.type === "screen-context-switch-cue").length;
  const proctorTabSwitches = events.filter((event) => ["screen-proctor-tab-hidden", "session-tab-hidden"].includes(event.type)).length;
  const displayShareStarts = events.filter((event) => ["screen-sharing-started", "full-screen-sharing-started"].includes(event.type)).length;
  const latestLight = [...events].reverse().find((event) => ["camera-ambient-light-sample", "ambient-light-sample"].includes(event.type));

  return <section className="realtime-metrics-panel"><div className="metrics-title"><Activity size={14}/><strong>Real-time monitoring metrics</strong><span>During approved quiz sessions</span></div><div className="metrics-grid"><div className="metric-chip suspicious"><b>{headMovementFlags}</b><span>Head-movement flags</span></div><div className="metric-chip suspicious"><b>{eyeHeadShifts}</b><span>Eye/head shift cues</span></div><div className="metric-chip suspicious"><b>{screenSwitchCues}</b><span>Possible tab/window switches</span></div><div className="metric-chip suspicious"><b>{lowLightFlags}</b><span>Low-light warnings</span></div><div className="metric-chip ok"><b>{displayShareStarts}</b><span>Screen-share starts</span></div><div className="metric-chip ok"><b>{proctorTabSwitches}</b><span>Proctor-tab changes</span></div></div><div className="metrics-summary"><span className="summary-item suspicious">Suspicious: {suspicious}</span><span className="summary-item ok">Okay: {okay}</span><span className="summary-item">Declared display: {student.reportedDisplay || "Not declared"} ({student.reportedDisplayCount || "Unknown count"})</span><span className="summary-item">Latest light sample: {latestLight?.payload?.level != null ? `${Math.round(latestLight.payload.level * 100)}%` : "N/A"}</span></div><small>All cues are approximate and review-assist only; they do not by themselves prove misconduct.</small></section>;
}

function ReviewDecision({ student, onDecide, permissions }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewedEvidence, setReviewedEvidence] = useState(false);
  const [confirmedObjects, setConfirmedObjects] = useState([]);
  const objects = student.precheckSummary?.objectAnalysis?.objects || [];
  const allObjectsConfirmed = objects.every((item) => confirmedObjects.includes(item.label));
  async function decide(approved) {
    if ((approved && !permissions.approveStudents) || (!approved && !permissions.requestRetry)) {
      setError("Your current permission settings do not allow this action.");
      return;
    }
    if (!reviewedEvidence) {
      setError("Review the submitted walkthrough video before making a decision.");
      return;
    }
    if (approved && !allObjectsConfirmed) {
      setError("Confirm each detected object category is acceptable before approving.");
      return;
    }
    if (!approved && !message.trim()) {
      setError("Add the specific changes the student needs to make before requesting a retry.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDecide(student.id, approved, message.trim(), { reviewedEvidence, confirmedObjects });
    } catch (requestError) {
      setError(requestError.message || "Could not save your review.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="review-decision">
    <div className="object-review-list">
      <strong>Background object cues <span>AI-assisted · lecturer confirms</span></strong>
      {student.precheckSummary?.objectAnalysis?.status === "unavailable" && <p>{student.precheckSummary.objectAnalysis.note}</p>}
      {objects.length ? objects.map((item) => <label key={item.label} className="object-review-item"><input type="checkbox" checked={confirmedObjects.includes(item.label)} onChange={(event) => setConfirmedObjects((old) => event.target.checked ? [...old, item.label] : old.filter((label) => label !== item.label))}/><span><b>{item.label}</b> · {item.sightings} sampled frame{item.sightings === 1 ? "" : "s"} · up to {Math.round(item.maxConfidence * 100)}% confidence{item.sampleSeconds?.length ? ` · at ${item.sampleSeconds.map((second) => `${second}s`).join(", ")}` : ""} · I confirm this category is acceptable.</span></label>) : student.precheckSummary?.objectAnalysis?.status === "complete" ? <p>No object categories detected in sampled frames. This does not mean the space is empty.</p> : <p>Object labels unavailable; assess the video and images manually.</p>}
    </div>
    <label className="evidence-review-confirm"><input type="checkbox" checked={reviewedEvidence} onChange={(event) => setReviewedEvidence(event.target.checked)}/><span>I reviewed the submitted walkthrough video.</span></label>
    <label className="field-label">Message for student (required for retry)<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} placeholder="e.g. Please pan the camera more slowly and ensure the whole desk is visible." /></label>
    <div className="review-buttons"><button className="button-secondary" disabled={busy || !reviewedEvidence || !permissions.requestRetry} onClick={() => decide(false)}>Request changes & retry</button><button className="button-primary compact" disabled={busy || !reviewedEvidence || !allObjectsConfirmed || !permissions.approveStudents} onClick={() => decide(true)}><Check size={15}/>{busy ? "Saving…" : "Confirm & approve"}</button></div>{error && <div className="form-error">{error}</div>}
  </div>;
}

function LiveFeeds({ sessionId, student }) {
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const screenTileRef = useRef(null);
  const sessionFeedsRef = useRef(null);
  const receivedStreams = useRef({ screen: null, camera: null });
  const signalingRef = useRef(null);
  const feedRequestPendingRef = useRef(false);
  const latestCameraCue = [...(student.events || [])].reverse().find((event) => event.type.startsWith("camera-") || event.type.startsWith("face-") || event.type === "multiple-faces-detected");
  const [screenState, setScreenState] = useState("Connecting");
  const [cameraState, setCameraState] = useState("Connecting");
  const [retrying, setRetrying] = useState(false);
  const [feedRequestPending, setFeedRequestPending] = useState(false);
  const [lastFeedRequestMessage, setLastFeedRequestMessage] = useState("");
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
    let trackIds = {};
    let greetingTimer;
    pc.onicecandidate = (event) => { if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate })); };
    pc.ontrack = (event) => {
      const settings = event.track.getSettings();
      const streamId = event.streams[0]?.id;
      const screenTrack = trackIds.screen === event.track.id
        || streamIds.screen === streamId
        || Boolean(settings.displaySurface)
        || /screen|display|window|tab|monitor/i.test(event.track.label);
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
        trackIds = { camera: message.cameraTrackId, screen: message.screenTrackId };
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
      } else if (message.type === "feed-request-response") {
        setFeedRequestPending(false);
        feedRequestPendingRef.current = false;
        if (message.approved) {
          setRetrying(true);
          setScreenState("Reconnecting");
          setCameraState("Reconnecting");
          setLastFeedRequestMessage("Student approved feed reconnect. Reconnecting now…");
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "retry-media" }));
          window.setTimeout(() => setRetrying(false), 6000);
        } else {
          setRetrying(false);
          setLastFeedRequestMessage(message.reason || "Student declined feed reconnect request.");
          setScreenState((state) => state === "Retry requested" ? "No feed received" : state);
          setCameraState((state) => state === "Retry requested" ? "No feed received" : state);
        }
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
      setFeedRequestPending(false);
      feedRequestPendingRef.current = false;
      return;
    }
    if (feedRequestPending) return;
    setRetrying(true);
    setFeedRequestPending(true);
    feedRequestPendingRef.current = true;
    setLastFeedRequestMessage("Waiting for student approval to reconnect webcam and screen feeds…");
    setScreenState("Retry requested");
    setCameraState("Retry requested");
    socket.send(JSON.stringify({
      type: "feed-request",
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      requestedFeeds: { camera: true, screen: true },
      requester: "Lecturer"
    }));
    window.setTimeout(() => {
      if (!feedRequestPendingRef.current) return;
      setRetrying(false);
      setFeedRequestPending(false);
      feedRequestPendingRef.current = false;
      setLastFeedRequestMessage("No response yet from student. Ask them to approve feed reconnect.");
      setScreenState((state) => state === "Retry requested" ? "No feed received" : state);
      setCameraState((state) => state === "Retry requested" ? "No feed received" : state);
    }, 8000);
  }
  return <><div className="media-grid" ref={sessionFeedsRef}><div className="media-tile" key="screen"><div className="media-title"><Monitor size={14}/> Shared screen<span className="media-live"><i />{screenState}</span></div><div className="media-frame" ref={screenTileRef}>{screenState === "Live feed" ? <video ref={bindScreenVideo} autoPlay playsInline muted /> : <div className="media-placeholder"><Monitor size={24}/><span>{screenState}</span></div>}<button className="fullscreen-feed-button" type="button" onClick={toggleScreenFullscreen} disabled={!receivedStreams.current.screen}><Maximize2 size={14}/>{isScreenFullscreen ? "Exit full screen" : "Full screen"}</button></div></div><div className="media-tile" key="camera"><div className="media-title"><Video size={14}/> Webcam<span className="media-live"><i />{cameraState}</span></div><div className="media-frame">{cameraState === "Live feed" ? <video ref={bindCameraVideo} autoPlay playsInline muted /> : <div className="media-placeholder"><Video size={24}/><span>{cameraState}</span></div>}</div></div>{isSessionFullscreen && <button className="fullscreen-session-exit" type="button" onClick={toggleSessionFullscreen}>Exit full session view</button>}</div><div className="screen-share-summary"><Monitor size={14}/><strong>{activeScreenShares}</strong> active feed{activeScreenShares === 1 ? "" : "s"} received in this session.{student.reportedDisplayCount ? ` Student reports ${student.reportedDisplayCount} display${student.reportedDisplayCount === "1" ? "" : "s"}.` : " Student display count not reported."}{student.reportedDisplay ? ` Declared shared display: ${student.reportedDisplay}.` : ""}{student.screenReady && student.screenSurface === "monitor" ? " Browser confirms the captured source is an entire-display surface." : " Browser has not confirmed an entire-display surface."}<span>Display count and selection are student-reported; browsers do not reveal other connected monitors.</span></div><div className="live-feed-actions"><span>Check the student's sharing connection if either feed is unavailable.</span><button className="button-secondary" onClick={toggleSessionFullscreen} disabled={activeScreenShares === 0}><Maximize2 size={14}/>{isSessionFullscreen ? "Exit full session view" : "Full session view"}</button><button className="button-secondary" onClick={retryFeeds} disabled={retrying || student.status !== "approved"}><RefreshCw size={14} className={retrying ? "retry-spin" : ""}/>{retrying ? "Checking feeds…" : "Check & retry feeds"}</button></div>{lastFeedRequestMessage && <div className="form-error" style={{ marginTop: 8 }}>{lastFeedRequestMessage}</div>}<div className="live-analysis-card"><Activity size={14}/><span><strong>On-device camera checks</strong>{latestCameraCue ? ` · ${eventTitle(latestCameraCue.type)}${latestCameraCue.payload?.faceCount != null ? ` (${latestCameraCue.payload.faceCount} detected)` : ""} · ${formatTime(latestCameraCue.timestamp)}` : " · Waiting for the first check"}. Face position/count cues are approximate and are not misconduct findings.</span></div></>;
}

function EventTimeline({ events }) {
  const ordered = [...events].reverse();
  return <div className="timeline-wrap">{ordered.length ? <div className="timeline">{ordered.map((event) => {
    const severity = eventSeverity(event.type);
    const severityLabel = severity === "suspicious" ? "Suspicious" : severity === "ok" ? "Okay" : "Info";
    return <div className={`timeline-item severity-${severity}`} key={event.id}><div className={`timeline-icon ${severity === "suspicious" ? "attention" : severity === "ok" ? "safe" : ""}`}>{event.type.includes("screen") ? <Monitor size={14}/> : event.type.includes("camera") || event.type.includes("scan") ? <Webcam size={14}/> : <Activity size={14}/>}</div><div className="timeline-body"><strong>{eventTitle(event.type)}</strong><span className={`timeline-severity-badge severity-${severity}`}>{severityLabel}</span><p>{event.payload?.message || event.payload?.detail || event.payload?.note || event.type.replaceAll("-", " ")}</p>{event.payload?.imageDataUrl && <img className="event-evidence" src={event.payload.imageDataUrl} alt="Shared-screen snapshot captured at event time"/>}</div><time>{formatTime(event.timestamp)}</time></div>;
  })}</div> : <div className="no-evidence"><Activity size={18}/> No activity has been recorded yet.</div>}</div>;
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanVideoUrl, setScanVideoUrl] = useState("");
  const [recordingScan, setRecordingScan] = useState(false);
  const [scanVideoSize, setScanVideoSize] = useState(0);
  const [scanAnalysis, setScanAnalysis] = useState({ faceFrames: 0, maxFaces: 0, positionChanges: 0 });
  const [analyzingObjects, setAnalyzingObjects] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lowLightAssist, setLowLightAssist] = useState(false);
  const [pendingFeedRequest, setPendingFeedRequest] = useState(null);
  const [faceMonitor, setFaceMonitor] = useState({ state: "idle", count: null, detail: "Local face-presence and position checks start after webcam access." });
  const cameraRef = useRef(null);
  const trackingVideoRef = useRef(null);
  const screenRef = useRef(null);
  const canvasRef = useRef(null);
  const stopFaceTrackingRef = useRef(null);
  const sessionEndRef = useRef(false);
  const scanAnalysisRef = useRef({ active: false, faceFrames: 0, maxFaces: 0, positionChanges: 0 });
  const scanChunksRef = useRef([]);
  const scanRecorderRef = useRef(null);
  const scanStopTimerRef = useRef(null);
  const scanVideoUrlRef = useRef("");
  const scanVideoBlobRef = useRef(null);
  const screenShiftRef = useRef({ recent: [], lastReportedAt: 0, previousSignature: null });
  const lightStateRef = useRef({ low: false, lastSampleAt: 0 });
  const signalingSocketRef = useRef(null);
  const sendOfferRef = useRef(null);
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
    clearTimeout(scanStopTimerRef.current);
    if (scanRecorderRef.current?.state === "recording") scanRecorderRef.current.stop();
    if (scanVideoUrlRef.current) URL.revokeObjectURL(scanVideoUrlRef.current);
  }, []);
  useEffect(() => () => {
    if (!isViteHotUpdate()) cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);
  useEffect(() => () => {
    if (!isViteHotUpdate()) screenStream?.getTracks().forEach((track) => track.stop());
  }, [screenStream]);

  useEffect(() => {
    if (!student || !session || !["setup", "awaiting-review", "changes-requested", "approved"].includes(student.status)) return;
    const interval = setInterval(async () => {
      try {
        const latest = await api(`/sessions/${session.id}/students/${student.id}/status`);
        const currentStatus = latest.sessionStatus === "ended" ? "ended" : latest.studentStatus;
        if (currentStatus) {
          setStudent((current) => current ? { ...current, status: currentStatus, reviewMessage: latest.reviewMessage || "" } : current);
          if (currentStatus === "ended") {
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
    const announceStudent = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: "student-ready",
        cameraStreamId: cameraStream?.id,
        screenStreamId: screenStream?.id,
        cameraTrackId: cameraStream?.getVideoTracks?.()[0]?.id,
        screenTrackId: screenStream?.getVideoTracks?.()[0]?.id
      }));
    };
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
    signalingSocketRef.current = socket;
    sendOfferRef.current = sendOffer;
    socket.onopen = () => { announceStudent(); greetingTimer = setInterval(announceStudent, 1200); };
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "lecturer-ready" && !offerStarted) {
        offerStarted = true;
        clearInterval(greetingTimer);
        await sendOffer();
      } else if (message.type === "retry-media") {
        await sendOffer(true);
      } else if (message.type === "feed-request") {
        setPendingFeedRequest({
          requestId: message.requestId,
          requester: message.requester || "Lecturer",
          requestedFeeds: message.requestedFeeds || { camera: true, screen: true }
        });
      } else if (message.type === "answer") {
        await pc.setRemoteDescription(message.answer);
        for (const candidate of queuedCandidates.splice(0)) await pc.addIceCandidate(candidate);
      } else if (message.type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(message.candidate); else queuedCandidates.push(message.candidate);
      }
    };
    return () => {
      clearInterval(greetingTimer);
      if (signalingSocketRef.current === socket) signalingSocketRef.current = null;
      if (sendOfferRef.current === sendOffer) sendOfferRef.current = null;
      socket.close();
      pc.close();
    };
  }, [student?.id, student?.status, sessionId, cameraStream, screenStream]);

  useEffect(() => {
    if (!student || !cameraStream) return;
    let cancelled = false;
    let stopTracking;
    const monitoringActive = student.status === "approved";
    const report = (type, payload = {}) => {
      if (!monitoringActive) return;
      api(`/sessions/${sessionId}/students/${student.id}/events`, {
        method: "POST", body: JSON.stringify({ type, payload })
      }).then(() => setEventCount((count) => count + 1)).catch(() => {});
    };

    startFaceTracking(trackingVideoRef.current, (result) => {
      if (result.kind === "face-count") {
        if (scanAnalysisRef.current.active) {
          scanAnalysisRef.current.faceFrames += 1;
          scanAnalysisRef.current.maxFaces = Math.max(scanAnalysisRef.current.maxFaces, result.count);
          setScanAnalysis({ ...scanAnalysisRef.current });
        }
        setFaceMonitor({ state: result.count === 1 ? "present" : result.count === 0 ? "not-visible" : "multiple", count: result.count, detail: result.count === 1 ? "One face detected" : `${result.count} faces detected` });
        report("camera-face-count-observed", { faceCount: result.count, note: "On-device face count cue; may be inaccurate and requires lecturer review." });
      } else if (result.kind === "face-position-change") {
        if (scanAnalysisRef.current.active) {
          scanAnalysisRef.current.positionChanges += 1;
          setScanAnalysis({ ...scanAnalysisRef.current });
        }
        setFaceMonitor({ state: "movement", count: result.count, detail: "Face position changed" });
        report("camera-movement-suspicious", {
          faceCount: result.count,
          message: "Sudden face-position change cue detected during the approved session.",
          note: "Coarse on-device webcam movement cue; this is not a misconduct finding by itself."
        });
      } else if (result.kind === "face-position-settled") {
        setFaceMonitor({ state: "present", count: result.count, detail: "Face position settled" });
        report("camera-movement-okay", {
          faceCount: result.count,
          message: "Face-position cue settled during monitoring.",
          note: "Automated cue only; used as context in the activity timeline."
        });
      } else if (result.kind === "eye-head-zone") {
        setFaceMonitor({ state: result.zone === "center" ? "present" : "movement", count: result.count, detail: result.zone === "center" ? "Eye/head position centered" : `Eye/head orientation cue: ${result.zone}` });
        report(result.zone === "center" ? "camera-eye-head-centered" : "camera-eye-head-shift-cue", {
          faceCount: result.count,
          zone: result.zone,
          message: result.zone === "center" ? "Eye/head orientation returned to center." : `Eye/head orientation shifted toward ${result.zone}.`,
          note: "Coarse face-orientation cue from webcam position; may be inaccurate and requires lecturer interpretation."
        });
      } else {
        setFaceMonitor({ state: result.kind, count: result.count, detail: result.kind === "face-not-detected" ? "Face not visible across several checks" : result.kind === "multiple-faces-detected" ? "Multiple faces detected across several checks" : "Face visible again" });
        const typeByKind = {
          "face-not-detected": "camera-face-not-detected",
          "multiple-faces-detected": "camera-multiple-faces-detected",
          "face-detected-again": "camera-face-detected-again"
        };
        report(typeByKind[result.kind] || `camera-${result.kind}`, {
          faceCount: result.count,
          message: result.kind === "face-detected-again" ? "Face detected again in camera view." : result.kind === "face-not-detected" ? "Face not visible in repeated checks." : result.kind === "multiple-faces-detected" ? "Multiple faces detected in repeated checks." : "Camera face cue observed.",
          note: "Automated camera cue; may be inaccurate and requires lecturer review."
        });
      }
    }, (state, error) => {
      if (cancelled) return;
      setFaceMonitor({ state, count: null, detail: state === "loading" ? "Starting local face-presence checks…" : error?.message || "Local face checks are unavailable." });
      if (state === "error") report("camera-face-tracking-unavailable", { reason: error?.message || "Detector error" });
    }).then((cleanup) => {
      if (cancelled) cleanup?.(); else { stopTracking = cleanup; stopFaceTrackingRef.current = cleanup; }
    }).catch((error) => {
      if (cancelled) return;
      setFaceMonitor({ state: "error", count: null, detail: error.message || "Could not load local face detector." });
      report("camera-face-tracking-unavailable", { reason: error.message || "Model could not be loaded" });
    });

    return () => { cancelled = true; stopTracking?.(); stopFaceTrackingRef.current = null; };
  }, [student?.id, student?.status, sessionId, cameraStream]);

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
    const onVisibility = () => { if (document.visibilityState === "hidden") record("screen-proctor-tab-hidden", { detail: "The proctoring page became hidden." }); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); };
  }, [student?.id, student?.status, sessionId]);

  useEffect(() => {
    if (!student || student.status !== "approved") return;
    const record = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type, payload }) }).catch(() => {});
      setEventCount((count) => count + 1);
    };
    const timer = setInterval(() => record("camera-monitoring-heartbeat", { cameraEnabled: Boolean(cameraStream?.active) }), 15000);
    return () => clearInterval(timer);
  }, [student?.id, student?.status, sessionId, cameraStream]);

  useEffect(() => {
    if (!student || student.status !== "approved") return;
    const record = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type, payload }) }).catch(() => {});
      setEventCount((count) => count + 1);
    };
    const timer = setInterval(() => record("screen-monitoring-heartbeat", { screenEnabled: Boolean(screenStream?.active) }), 15000);
    return () => clearInterval(timer);
  }, [student?.id, student?.status, sessionId, screenStream]);

  useEffect(() => {
    if (!student || student.status !== "approved" || !cameraStream) return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const record = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type, payload }) }).catch(() => {});
      setEventCount((count) => count + 1);
    };
    const timer = setInterval(() => {
      const video = trackingVideoRef.current || cameraRef.current;
      if (!video?.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      canvas.width = 48;
      canvas.height = 32;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let brightnessTotal = 0;
      for (let index = 0; index < imageData.length; index += 4) {
        brightnessTotal += 0.2126 * imageData[index] + 0.7152 * imageData[index + 1] + 0.0722 * imageData[index + 2];
      }
      const brightness = brightnessTotal / (canvas.width * canvas.height);
      const normalized = Number((brightness / 255).toFixed(3));
      const now = Date.now();
      if (now - lightStateRef.current.lastSampleAt > 20000) {
        record("camera-ambient-light-sample", {
          level: normalized,
          message: `Ambient light sample ${Math.round(normalized * 100)}%.`,
          note: "Approximate webcam brightness sample for monitoring context."
        });
        lightStateRef.current.lastSampleAt = now;
      }
      if (normalized < 0.2 && !lightStateRef.current.low) {
        lightStateRef.current.low = true;
        setLowLightAssist(true);
        record("camera-low-light-warning", {
          level: normalized,
          message: "Low-light cue detected from webcam feed.",
          note: "Approximate brightness cue; may be affected by camera exposure changes."
        });
      }
      if (normalized >= 0.25 && lightStateRef.current.low) {
        lightStateRef.current.low = false;
        setLowLightAssist(false);
        record("camera-light-normalized", {
          level: normalized,
          message: "Webcam lighting returned to a normal range.",
          note: "Approximate brightness recovery cue."
        });
      }
    }, 5000);
    return () => {
      clearInterval(timer);
      setLowLightAssist(false);
    };
  }, [student?.id, student?.status, sessionId, cameraStream]);

  useEffect(() => {
    if (!student || student.status !== "approved" || !screenStream) return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const record = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type, payload }) }).catch(() => {});
      setEventCount((count) => count + 1);
    };
    const timer = setInterval(() => {
      const video = screenRef.current;
      if (!video?.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      canvas.width = 36;
      canvas.height = 24;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const signature = [];
      for (let row = 0; row < 6; row += 1) {
        for (let column = 0; column < 6; column += 1) {
          const x = Math.min(canvas.width - 1, Math.round((column + 0.5) * canvas.width / 6));
          const y = Math.min(canvas.height - 1, Math.round((row + 0.5) * canvas.height / 6));
          const offset = (y * canvas.width + x) * 4;
          signature.push((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 765);
        }
      }
      const previous = screenShiftRef.current.previousSignature;
      screenShiftRef.current.previousSignature = signature;
      if (!previous) return;
      const delta = signature.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / signature.length;
      if (delta > 0.26) {
        const now = Date.now();
        screenShiftRef.current.recent.push(now);
        screenShiftRef.current.recent = screenShiftRef.current.recent.filter((stamp) => now - stamp < 20000);
        if (screenShiftRef.current.recent.length >= 3 && now - screenShiftRef.current.lastReportedAt > 15000) {
          screenShiftRef.current.lastReportedAt = now;
          record("screen-context-switch-cue", {
            delta: Number(delta.toFixed(3)),
            message: "Rapid screen-content changes detected (possible tab/window switching).",
            note: "Approximate cue from visual screen-frame shifts; requires lecturer review."
          });
        }
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [student?.id, student?.status, sessionId, screenStream]);

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
        api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "camera-webcam-feed-stopped" }) }).catch(() => {});
      }, { once: true });
      await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ cameraReady: true }) });
      await api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "camera-webcam-enabled" }) });
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
        body: JSON.stringify({ type: "screen-sharing-started", payload: {
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

  function finishBackgroundScan() {
    clearTimeout(scanStopTimerRef.current);
    if (scanRecorderRef.current?.state === "recording") scanRecorderRef.current.stop();
  }

  function recordBackgroundScan() {
    if (!cameraStream || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record the webcam walkthrough. Use a current desktop browser that supports MediaRecorder.");
      return;
    }
    if (!cameraStream.active) {
      setError("Your webcam is no longer active. Enable it again before recording the walkthrough.");
      return;
    }
    const supportedType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!supportedType) {
      setError("This browser cannot create a supported WebM or MP4 walkthrough video.");
      return;
    }
    try {
      setError("");
      scanVideoBlobRef.current = null;
      setScanVideoUrl("");
      setScanVideoSize(0);
      if (scanVideoUrlRef.current) URL.revokeObjectURL(scanVideoUrlRef.current);
      scanVideoUrlRef.current = "";
      scanChunksRef.current = [];
      scanAnalysisRef.current = { active: true, faceFrames: 0, maxFaces: 0, positionChanges: 0 };
      setScanAnalysis({ faceFrames: 0, maxFaces: 0, positionChanges: 0 });
      const recorder = new MediaRecorder(cameraStream, { mimeType: supportedType, videoBitsPerSecond: 220_000 });
      scanRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) scanChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        scanAnalysisRef.current.active = false;
        setRecordingScan(false);
        setError("The background walkthrough could not be recorded. Please try again.");
      };
      recorder.onstop = () => {
        scanAnalysisRef.current.active = false;
        setRecordingScan(false);
        const blob = new Blob(scanChunksRef.current, { type: recorder.mimeType || supportedType });
        if (!blob.size) {
          setError("No video was recorded. Please try the walkthrough again.");
          return;
        }
        if (blob.size >= 3_500_000) {
          scanVideoBlobRef.current = null;
          setError("That video must be under 3.5 MB. Try a shorter, slower walkthrough.");
          return;
        }
        const videoType = recorder.mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm";
        scanVideoBlobRef.current = new Blob([blob], { type: videoType });
        setScanVideoSize(blob.size);
        if (scanVideoUrlRef.current) URL.revokeObjectURL(scanVideoUrlRef.current);
        scanVideoUrlRef.current = URL.createObjectURL(blob);
        setScanVideoUrl(scanVideoUrlRef.current);
        setScanAnalysis({
          faceFrames: scanAnalysisRef.current.faceFrames,
          maxFaces: scanAnalysisRef.current.maxFaces,
          positionChanges: scanAnalysisRef.current.positionChanges
        });
      };
      recorder.start(500);
      setRecordingScan(true);
      scanStopTimerRef.current = setTimeout(finishBackgroundScan, 10_000);
    } catch (recordError) {
      scanAnalysisRef.current.active = false;
      setRecordingScan(false);
      setError(recordError.message || "The background walkthrough could not start.");
    }
  }

  function retrySetup() {
    setScanVideoUrl("");
    scanVideoBlobRef.current = null;
    setScanVideoSize(0);
    if (scanVideoUrlRef.current) URL.revokeObjectURL(scanVideoUrlRef.current);
    scanVideoUrlRef.current = "";
    setScanAnalysis({ faceFrames: 0, maxFaces: 0, positionChanges: 0 });
    setError("");
    api(`/sessions/${sessionId}/students/${student.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "setup", reviewMessage: "", precheckVideo: null, precheckSummary: null })
    }).then(setStudent).catch((requestError) => setError(requestError.message));
  }

  async function submitScan() {
    if (!scanVideoBlobRef.current || !cameraStream || !screenStream) return;
    setBusy(true); setAnalyzingObjects(true); setError("");
    try {
      const dataUrl = await blobToDataUrl(scanVideoBlobRef.current);
      let objectSummary;
      try {
        objectSummary = await analyzeBackgroundVideo(scanVideoBlobRef.current);
      } catch (analysisError) {
        objectSummary = {
          status: "unavailable",
          sampleCount: 0,
          objects: [],
          note: `Automatic object cues were unavailable (${analysisError.message || "model could not load"}). Review the video manually.`
        };
      }
      const result = await api(`/sessions/${sessionId}/students/${student.id}/precheck`, {
        method: "POST",
        body: JSON.stringify({
          video: { dataUrl, mimeType: scanVideoBlobRef.current.type },
          summary: {
            ...scanAnalysis,
            objectAnalysis: objectSummary,
            note: "Approximate on-device face presence/count and face-position cues during the clip; not a room-compliance or misconduct determination."
          }
        })
      });
      setStudent(result); setSaved(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); setAnalyzingObjects(false); }
  }

  async function endSession() {
    if (!student) return;
    try { await api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "student-ended-session" }) }); await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) }); } catch { /* local exit still works */ }
    sessionEndRef.current = true;
    cameraStream?.getTracks().forEach((track) => track.stop()); screenStream?.getTracks().forEach((track) => track.stop());
    location.href = "/";
  }

  async function respondToFeedRequest(approved) {
    if (!pendingFeedRequest) return;
    const socket = signalingSocketRef.current;
    const request = pendingFeedRequest;
    setPendingFeedRequest(null);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Lecturer feed request expired. Ask your lecturer to try again.");
      return;
    }
    if (!approved) {
      socket.send(JSON.stringify({
        type: "feed-request-response",
        requestId: request.requestId,
        approved: false,
        reason: "Student declined feed reconnect request."
      }));
      return;
    }
    const missingCamera = request.requestedFeeds?.camera && !cameraStream?.active;
    const missingScreen = request.requestedFeeds?.screen && !screenStream?.active;
    if (missingCamera || missingScreen) {
      const reason = missingCamera && missingScreen
        ? "Student must re-enable webcam and screen sharing before reconnecting feeds."
        : missingCamera
          ? "Student webcam is not active."
          : "Student screen sharing is not active.";
      socket.send(JSON.stringify({ type: "feed-request-response", requestId: request.requestId, approved: false, reason }));
      setError(missingCamera
        ? "Your lecturer requested webcam reconnect. Please enable your webcam first."
        : "Your lecturer requested screen reconnect. Please share your entire screen first.");
      return;
    }
    socket.send(JSON.stringify({
      type: "feed-request-response",
      requestId: request.requestId,
      approved: true,
      approvedAt: new Date().toISOString()
    }));
    try {
      await sendOfferRef.current?.(true);
    } catch {
      setError("Could not reconnect feeds right now. Ask your lecturer to retry.");
    }
  }

  if (error && !session) return <StudentShell><div className="student-error"><ShieldAlert size={26}/><h2>We couldn’t open this assessment</h2><p>{error}</p><a className="button-secondary" href="/">Return to home</a></div></StudentShell>;
  if (!session) return <StudentShell><div className="student-loading">Loading assessment details…</div></StudentShell>;
  if (session.status !== "live") return <StudentShell><div className="student-error"><Clock3 size={26}/><h2>This assessment isn’t open</h2><p>Ask your lecturer if you think you should have access.</p></div></StudentShell>;

  if (!student) return <StudentShell><div className="student-join-card"><div className="student-symbol"><GraduationCap size={22}/></div><div className="eyebrow">ASSESSMENT INVITATION</div><h1>{session.title}</h1><p className="student-intro">Hosted by {session.lecturerName}. Join to complete your device check and request access to begin.</p><div className="privacy-callout"><LockKeyhole size={17}/><span>Your lecturer will see your screen and webcam only after you choose to share them. You can stop sharing anytime.</span></div><label className="field-label">Your name<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="First and last name" /></label><label className="field-label">Student number<input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="Your class ID" /></label><label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I understand my lecturer can view the screen and webcam I choose to share during the approved session. While my webcam is enabled, approximate face-presence/count and coarse face-position checks run locally on my device. These cues may be inaccurate and are not misconduct findings. Session activity is logged. The submitted walkthrough video is also sampled on this device by an object detector; approximate object-category labels and confidence summaries are shared with your lecturer for review. This may miss or mislabel objects and does not determine whether your workspace is acceptable.</span></label>{error && <div className="form-error">{error}</div>}<button className="button-primary full-button" onClick={join} disabled={busy || !studentName.trim() || !studentNumber.trim() || !consented}>{busy ? "Joining…" : "Continue to device check"}<ArrowRight size={16}/></button><div className="student-safe-note"><ShieldCheck size={14}/> Permission is requested by your browser, not granted silently.</div></div></StudentShell>;

  const isApproved = student.status === "approved";
  return <StudentShell>
    <div className="student-workspace">
      <div className="student-topline"><a className="student-brand" href="/"><span className="brand-mark"><ShieldCheck size={17}/></span>Proctor Buddy</a><div className="student-session-tag"><span className={`secure-dot ${isApproved ? "" : "amber-dot"}`}/>{isApproved ? "Proctoring active" : "Pre-assessment check"}</div><button className="student-exit" onClick={endSession}><LogOut size={15}/> Exit</button></div>
      <div className="student-main">
        <div className="student-progress"><span className="done"><Check size={12}/> Join</span><i/><span className={student.status !== "setup" ? "done" : "current"}>{student.status !== "setup" ? <Check size={12}/> : "2"} Setup</span><i/><span className={isApproved ? "done" : student.status === "awaiting-review" ? "current" : ""}>{isApproved ? <Check size={12}/> : "3"} Review</span><i/><span className={isApproved ? "current" : ""}>Quiz</span></div>
        {student.status === "ended" ? <div className="awaiting-card"><div className="waiting-icon"><CheckCircle2 size={24}/></div><div className="eyebrow">SESSION CLOSED</div><h1>This assessment has ended</h1><p>Your camera and screen sharing have been stopped. Contact your lecturer if you need help.</p></div> : isApproved ? <div className="approved-view">{error && <div className="form-error student-form-error"><ShieldAlert size={15}/><span>{error}</span><button className="button-secondary" onClick={screenStream ? shareScreen : enableCamera}>{screenStream ? "Share entire screen again" : "Enable webcam"}</button></div>}<div className="approval-success"><div className="success-ring"><CheckCircle2 size={31}/></div><div className="eyebrow">YOU’RE ALL SET</div><h1>Session approved</h1><p>Your lecturer has approved your setup. Keep this tab open and leave screen sharing enabled during your quiz.</p>{student.reviewMessage && <div className="student-review-message"><strong>Message from your lecturer</strong><p>{student.reviewMessage}</p></div>}</div><div className="live-preview-grid"><div className="live-preview-card"><div><Monitor size={15}/> Shared screen <span className="live-label"><i/>LIVE</span></div><video ref={bindScreenVideo} autoPlay playsInline muted /></div><div className="live-preview-card"><div><Video size={15}/> Webcam <span className="live-label"><i/>LIVE</span></div><video ref={bindCameraVideo} autoPlay playsInline muted /></div></div><div className="monitoring-card"><div className="monitoring-symbol"><Activity size={19}/></div><div><strong>Monitoring is active</strong><span>Your lecturer can see the live webcam and full-screen feeds. Approximate face presence/count and coarse face-position checks run locally on your device and are not misconduct findings.</span></div><span className="event-counter">{eventCount} events</span></div><div className="student-quiz-note"><BookOpen size={17}/><span><strong>Ready for your quiz?</strong><br/>Open your quiz in a new tab or window. Keep screen sharing active.</span><ArrowUpRight size={16}/></div><button className="button-secondary full-button end-button" onClick={endSession}>End monitored session</button></div> : student.status === "changes-requested" ? <div className="awaiting-card retry-request-card"><div className="waiting-icon"><RefreshCw size={24}/></div><div className="eyebrow">REVIEW REQUESTED</div><h1>Please update your setup</h1><p>{student.reviewMessage || "Your lecturer has requested another background scan."}</p><button className="button-primary" onClick={retrySetup} disabled={busy}>I’ve addressed this — retry scan<ArrowRight size={16}/></button></div> : student.status === "awaiting-review" ? <div className="awaiting-card"><div className="waiting-icon"><Clock3 size={24}/></div><div className="eyebrow">SETUP SUBMITTED</div><h1>Waiting for your lecturer</h1><p>Your background check has been submitted. Your lecturer will review it before you can start.</p><div className="waiting-progress"><span/><span/><span className="pulse-dot"/></div><small>This page will update automatically after the review.</small></div> : <div className="setup-content">
            <div className="setup-intro"><div className="eyebrow">STEP 2 OF 4 · DEVICE CHECK</div><h1>Set up your space</h1><p>Enable your webcam and choose the entire display you’ll use for the quiz. Approximate face-presence/count and coarse face-position checks run locally; these cues may be inaccurate and are not misconduct findings.</p></div>
            <div className="device-grid">
              <div className={`device-card ${cameraStream ? "device-ready" : ""}`}><div className="device-card-head"><div className="device-icon"><Video size={18}/></div><span className={cameraStream ? "device-status ready" : "device-status"}><i/>{cameraStream ? "Enabled" : "Not enabled"}</span></div><h3>Webcam</h3><p>Allow camera access for the walkthrough and monitored session.</p>{cameraStream ? <div className="mini-video"><video ref={bindCameraVideo} autoPlay playsInline muted/><span><CheckCircle2 size={13}/> Camera preview</span></div> : <button className="button-secondary device-button" onClick={enableCamera}><Video size={15}/> Enable webcam</button>}</div>
              <div className={`device-card ${screenStream ? "device-ready" : ""}`}><div className="device-card-head"><div className="device-icon screen-icon"><Monitor size={18}/></div><span className={screenStream ? "device-status ready" : "device-status"}><i/>{screenStream ? "Entire screen shared" : "Not sharing"}</span></div><h3>Entire screen</h3><p>Choose the entire display where you’ll complete your quiz.</p>{!screenStream && <div className="display-declaration"><label className="field-label">Displays in your setup (self-reported)<select value={displayCount} onChange={(event) => { setDisplayCount(event.target.value); setSelectedDisplay("Primary display"); }}><option value="1">1 display</option><option value="2">2 displays</option><option value="3">3 displays</option><option value="4+">4 or more displays</option></select></label><label className="field-label">Display you plan to share<select value={selectedDisplay} onChange={(event) => setSelectedDisplay(event.target.value)}><option>Primary display</option>{Array.from({ length: displayCount === "4+" ? 3 : Math.max(0, Number(displayCount) - 1) }, (_, index) => <option key={index}>External display {index + 1}</option>)}{displayCount === "4+" && <option>External display 4+</option>}</select></label><small>Browsers do not reveal connected monitor count; this is your declaration.</small></div>}{screenStream ? <div className="mini-video"><video ref={bindScreenVideo} autoPlay playsInline muted/><span><CheckCircle2 size={13}/> Screen preview</span></div> : <button className="button-secondary device-button" onClick={shareScreen}><Monitor size={15}/> Share entire screen</button>}</div>
            </div>
            <div className="camera-analysis-card"><div className="analysis-indicator"><span className={`analysis-pulse ${faceMonitor.state === "present" ? "on" : ""}`}/><div><strong>{cameraStream ? "Camera checks active" : "Camera checks not started"}</strong><span>{cameraStream ? faceMonitor.detail : "Checks start when webcam access is enabled."}</span></div></div><span className="analysis-local">ON DEVICE</span></div>
            <div className="scan-card background-video-card"><div className="eyebrow">10-SECOND WALKTHROUGH</div><h2>Record a short video of your background</h2><p>Move your webcam slowly to show the area around your workspace. Maximum upload size: 3.5 MB.</p>{scanVideoUrl && <video className="background-video-preview" style={{ width: "100%", maxHeight: 320, objectFit: "contain" }} src={scanVideoUrl} controls playsInline/>}{recordingScan ? <div className="recording-controls" style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="recording-indicator"><i/>Recording (up to 10 seconds)</span><button className="button-secondary" onClick={finishBackgroundScan}>Stop recording</button></div> : <div className="recording-controls" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><button className="button-secondary" onClick={recordBackgroundScan} disabled={!cameraStream || busy}><Video size={15}/>{scanVideoUrl ? "Record again" : "Record background video"}</button>{scanVideoUrl && <><button className="button-secondary" onClick={() => { scanVideoBlobRef.current = null; setScanVideoUrl(""); setScanVideoSize(0); if (scanVideoUrlRef.current) URL.revokeObjectURL(scanVideoUrlRef.current); scanVideoUrlRef.current = ""; }}>Remove video</button><span className="video-size-note">{(scanVideoSize / (1024 * 1024)).toFixed(2)} MB</span></>}</div>}<div className="scan-hint"><Eye size={15}/> Approximate on-device face-presence and position cues are only a review aid; your lecturer reviews the video.</div></div>
            {error && <div className="form-error student-form-error"><ShieldAlert size={15}/><span>{error}</span>{!cameraStream && <button className="button-secondary" onClick={enableCamera}>Enable webcam</button>}{!screenStream && <button className="button-secondary" onClick={shareScreen}>Share entire screen</button>}</div>}
            <div className="setup-footer"><div><LockKeyhole size={15}/><span>Camera and screen access can be stopped in your browser at any time.</span></div><button className="button-primary" onClick={submitScan} disabled={busy || recordingScan || !cameraStream || !screenStream || !scanVideoBlobRef.current}>{busy ? analyzingObjects ? "Analyzing walkthrough…" : "Submitting…" : "Submit setup for review"}<ArrowRight size={16}/></button></div>
          </div>}
           </div>
          {pendingFeedRequest && <div className="form-error" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}><span><strong>{pendingFeedRequest.requester}</strong> requested to reconnect your {pendingFeedRequest.requestedFeeds?.camera && pendingFeedRequest.requestedFeeds?.screen ? "webcam and shared screen" : pendingFeedRequest.requestedFeeds?.camera ? "webcam" : "shared screen"} feed{pendingFeedRequest.requestedFeeds?.camera && pendingFeedRequest.requestedFeeds?.screen ? "s" : ""}.</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button-secondary" onClick={() => respondToFeedRequest(false)}>Not now</button><button className="button-primary compact" onClick={() => respondToFeedRequest(true)}>Approve reconnect</button></div></div>}
          {lowLightAssist && <div className="low-light-assist" aria-hidden="true"><div className="low-light-assist-tip">Low webcam light detected · brighten your face in view</div></div>}
      <footer className="student-footer"><span><ShieldCheck size={14}/> Proctor Buddy · Assessment workspace</span><a href="#" onClick={(event) => { event.preventDefault(); alert("Contact your lecturer for help with this assessment."); }}>Need help?</a></footer><video ref={trackingVideoRef} className="tracking-video" autoPlay playsInline muted/><canvas ref={canvasRef} width="720" height="405" hidden/>
    </div>
  </StudentShell>;
}

function StudentShell({ children }) { return <div className="student-shell">{children}</div>; }

function StatusPill({ status }) {
  const cls = status === "live" || status === "approved" ? "status-live" : status === "awaiting-review" ? "status-review" : status === "ended" ? "status-ended" : "status-setup";
  return <span className={`status-pill ${cls}`}><i/>{status === "live" ? "Live" : statusLabel(status)}</span>;
}
function StatusDot({ status }) { return <span className={`status-dot ${status === "awaiting-review" ? "needs" : status === "approved" ? "approved" : ""}`} title={statusLabel(status)} />; }
function initials(name = "") { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function eventSeverity(type) {
  const suspicious = new Set(["movement-suspicious", "camera-movement-suspicious", "eye-head-shift-cue", "camera-eye-head-shift-cue", "face-not-detected", "camera-face-not-detected", "multiple-faces-detected", "camera-multiple-faces-detected", "screen-sharing-stopped", "session-tab-hidden", "screen-proctor-tab-hidden", "webcam-feed-stopped", "camera-webcam-feed-stopped", "face-tracking-unavailable", "camera-face-tracking-unavailable", "low-light-warning", "camera-low-light-warning", "screen-context-switch-cue"]);
  const okay = new Set(["assessment-monitoring-started", "monitoring-heartbeat", "camera-monitoring-heartbeat", "screen-monitoring-heartbeat", "movement-okay", "camera-movement-okay", "eye-head-centered", "camera-eye-head-centered", "face-detected-again", "camera-face-detected-again", "student-approved", "full-screen-sharing-started", "screen-sharing-started", "webcam-enabled", "camera-webcam-enabled", "light-normalized", "camera-light-normalized"]);
  if (suspicious.has(type)) return "suspicious";
  if (okay.has(type)) return "ok";
  return "info";
}
function eventTitle(type) { return ({ "assessment-monitoring-started": "Monitoring started", "monitoring-heartbeat": "Session active", "camera-monitoring-heartbeat": "Camera monitoring active", "screen-monitoring-heartbeat": "Screen monitoring active", "screen-sharing-stopped": "Screen sharing stopped", "session-tab-hidden": "Proctoring tab changed", "screen-proctor-tab-hidden": "Proctoring tab changed", "background-scan-submitted": "Background scan submitted", "background-video-submitted": "Background video submitted", "student-approved": "Student approved", "scan-changes-requested": "Retry requested", "student-ended-session": "Session ended", "face-count-observed": "On-device face count", "camera-face-count-observed": "Webcam face count", "face-not-detected": "Face not visible", "camera-face-not-detected": "Face not visible", "multiple-faces-detected": "Multiple faces detected", "camera-multiple-faces-detected": "Multiple faces detected", "face-detected-again": "Face visible again", "camera-face-detected-again": "Face visible again", "movement-suspicious": "Head movement flagged", "camera-movement-suspicious": "Head movement flagged", "movement-okay": "Head movement settled", "camera-movement-okay": "Head movement settled", "eye-head-shift-cue": "Eye/head shift cue", "camera-eye-head-shift-cue": "Eye/head shift cue", "eye-head-centered": "Eye/head centered", "camera-eye-head-centered": "Eye/head centered", "ambient-light-sample": "Ambient light sample", "camera-ambient-light-sample": "Ambient light sample", "low-light-warning": "Low-light warning", "camera-low-light-warning": "Low-light warning", "light-normalized": "Lighting normalized", "camera-light-normalized": "Lighting normalized", "screen-context-switch-cue": "Possible tab/window switching", "webcam-enabled": "Webcam enabled", "camera-webcam-enabled": "Webcam enabled", "webcam-feed-stopped": "Webcam feed stopped", "camera-webcam-feed-stopped": "Webcam feed stopped", "full-screen-sharing-started": "Full-screen sharing started", "screen-sharing-started": "Full-screen sharing started", "face-tracking-unavailable": "Face tracking unavailable", "camera-face-tracking-unavailable": "Face tracking unavailable" }[type] || type.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase())); }
function captureFrame(video, canvas) {
  if (!video || !canvas || !video.videoWidth) return null;
  const context = canvas.getContext("2d");
  const scale = Math.min(1, 640 / video.videoWidth, 360 / video.videoHeight);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.55);
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the recorded walkthrough video."));
    reader.readAsDataURL(blob);
  });
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
  if (!window.isSecureContext && !localHost) return "Camera and screen access require HTTPS. For local testing, open http://localhost:5173/ (not the Network/LAN IP address). For deployment, use an HTTPS URL.";
  if (!navigator.mediaDevices) return "This page cannot access browser media devices. Open the app in a current Chrome or Edge browser using http://localhost:5173/ or HTTPS, then reload the page.";
  if (typeof navigator.mediaDevices[method] !== "function") return method === "getUserMedia" ? "This browser does not support webcam capture here. Use a current Chrome or Edge browser and allow camera access." : "This browser does not support screen sharing here. Use a current desktop Chrome or Edge browser over localhost or HTTPS.";
  return "";
}
function describeMediaError(error, device) {
  const label = device === "camera" ? "webcam" : "entire-screen sharing";
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") return `Browser permission for ${label} was denied or dismissed. Allow it in the browser prompt/site settings, then try again.`;
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return device === "camera" ? "No webcam was found. Connect or enable a camera, then try again." : "No display is available to share.";
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return `The ${label} is busy or unavailable. Close other apps using it and try again.`;
  if (device === "screen" && error?.name === "InvalidStateError") return "Screen sharing must be started directly from the button. Click Share entire screen again.";
  return `${device === "camera" ? "Camera access" : "Full-screen sharing"} could not start: ${error?.message || "Unknown browser error"}`;
}
function attachVideoStream(video, stream) {
  if (!video) return;
  if (stream && video.srcObject !== stream) video.srcObject = stream;
  if (!stream && video.srcObject) video.srcObject = null;
  if (stream) video.play().catch(() => {});
}
