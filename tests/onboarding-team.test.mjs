// Unify Phase 3 (migration 027): the Onboarding panel with the team.
// Recordings and their transcript status, uploading a call recording,
// copying the questions to send, and pasting a transcript so the team builds
// the documents (the bridge on Tait's Mac picks it up). Operators only.
import { freshDb, makeHarness, checker, pickFile } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle, as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);
const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const NEW = "33333333-3333-3333-3333-333333333333";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,onboarding_questions) values ('${NEW}','New Co','new','self-serve',
    '[{"section":"Your business","items":[{"id":"q1","q":"What do you sell?"},{"id":"q2","q":"A customer you are proud of","story":true}]}]');
  insert into social_client_users (id,client_id,email) values ('${CL}','${NEW}','c@x');
  insert into social_client_onboarding (client_id, voice_memo_path, voice_memo_uploaded_at) values ('${NEW}','${NEW}/voice-memo/memo.m4a', now());
  insert into social_onboarding_recordings (client_id, kind, name, storage_path, uploaded_by_role, transcript_status, transcript, transcribed_at)
    values ('${NEW}','voice_memo','memo.m4a','${NEW}/voice-memo/memo.m4a','client','done','I run a cleaning company.', now());
`);

chk("client can't read recordings", !(await as(CL, `select * from social_onboarding_recordings`)).data.length);
chk("client can't add recordings", !!(await as(CL, `insert into social_onboarding_recordings (client_id,name,storage_path) values ($1,'x','y')`, [NEW])).error);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
op.w.openOnboarding(NEW); await settle();
const modal = () => op.d.querySelector(".modal-box");
chk("recordings list shows the voice memo, transcribed", modal().textContent.includes("Voice memo: memo.m4a") && modal().textContent.includes("Transcribed"), modal().textContent.slice(0, 400));
chk("build button asks the team", op.d.getElementById("obBuild").textContent === "Save and ask the team to build documents");

// Copy to send: plain text, story prompts explained.
let copied = null;
const stub = { writeText: async t => { copied = t; } };
try { Object.defineProperty(op.w.navigator, "clipboard", { value: stub, configurable: true }); }
catch { try { op.w.navigator.clipboard.writeText = stub.writeText; } catch { Object.defineProperty(Object.getPrototypeOf(op.w.navigator), "clipboard", { get: () => stub, configurable: true }); } }
op.d.getElementById("obQCopy").click(); await settle();
chk("Copy to send copies the questions as plain text", copied && copied.includes("Your business") && copied.includes("- What do you sell?") && copied.includes("(Story: just name it) A customer") && !copied.includes("##"), copied);

// Upload a call recording.
pickFile(op, "obCall", "Call with New Co.m4a", "audio/mp4"); await settle();
const call = (await db.query(`select kind, name, storage_path, transcript_status, uploaded_by_role from social_onboarding_recordings where kind='call'`)).rows[0];
chk("call recording uploaded and waiting to transcribe", call && call.storage_path.startsWith(NEW + "/calls/") && call.transcript_status === "waiting" && call.uploaded_by_role === "operator", call);
chk("upload went to the onboarding bucket", op.ui.log.some(l => l.upload && l.upload.bucket === "onboarding" && l.upload.path === call.storage_path), op.ui.log.filter(l => l.upload));
chk("panel lists it as waiting", modal().textContent.includes("Waiting to transcribe"));

// Paste a transcript: saved, and a done 'Pasted transcript' row for the bridge.
const pasted = "Q: who are your customers? A: busy parents in Naperville who work long hours and need the house clean before the weekend. ".repeat(3);
op.d.getElementById("obTranscript").value = pasted;
op.d.getElementById("obBuild").click(); await settle();
const rec = (await db.query(`select transcript, transcript_status, transcribed_at from social_onboarding_recordings where name='Pasted transcript'`)).rows[0];
chk("pasted transcript becomes a done recording (the bridge starts the documents)", rec && rec.transcript_status === "done" && rec.transcript.includes("busy parents") && rec.transcribed_at, rec);
chk("transcript saved on the client", (await db.query(`select transcript from social_client_onboarding where client_id=$1`, [NEW])).rows[0].transcript.includes("busy parents"));
chk("no call to the old build-documents API", !op.ui.log.some(l => l.fetch && l.fetch.includes("build-documents")));
chk("no page errors", !op.ui.errors.length, op.ui.errors);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
