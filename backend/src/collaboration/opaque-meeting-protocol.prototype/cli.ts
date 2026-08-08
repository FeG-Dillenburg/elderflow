/** PROTOTYPE — run with `pnpm prototype:opaque-meeting`. */
import { createInterface } from 'node:readline';
import { OpaqueMeetingProtocolLab, type StableFragment } from './model';
import { runTiptapProbe } from './tiptap-probe';
import { runTransportProbe } from './transport-probe';

const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

const render = (lab: OpaqueMeetingProtocolLab): void => {
  console.clear();
  const state = lab.state();
  console.log(`${bold}PROTOTYPE — opaque encrypted Meeting-document protocol${reset}`);
  console.log(`${dim}${state.question}${reset}\n`);
  console.log(`${bold}Meeting${reset} ${state.meeting.status}  ${dim}${state.meeting.documentId}${reset}`);
  console.log(`${bold}Relay${reset} snapshot=${state.relay.activeSnapshotId} updates=${state.relay.persistedUpdates} ephemeral=${state.relay.encryptedEphemeralRelays} knowsKey=${state.relay.knowsKey}`);
  console.log(`${bold}Appearances${reset} ${state.meeting.appearances.join(', ')}`);

  for (const [id, client] of Object.entries(state.clients)) {
    console.log(`\n${bold}${id}${reset} connected=${client.connected} pending=${client.pending} discarded-after-completion=${client.discardedAfterCompletion} error=${client.lastError ?? '-'}`);
    for (const [name, value] of Object.entries(client.fragments)) {
      console.log(`  ${dim}${name}${reset} ${value}`);
    }
  }

  if (state.observations.length) {
    console.log(`\n${bold}Latest observations${reset}`);
    for (const observation of state.observations) console.log(`  ${observation}`);
  }
  console.log(`\n${bold}[g]${reset}${dim} run full gate drill${reset}  ${bold}[d]${reset}${dim} disconnect/reconnect Bob${reset}  ${bold}[e]${reset}${dim} edit Alice general notes${reset}`);
  console.log(`${bold}[b]${reset}${dim} edit Bob minutes${reset}  ${bold}[a]${reset}${dim} add dynamic appearance atomically${reset}  ${bold}[p]${reset}${dim} encrypted presence${reset}`);
  console.log(`${bold}[r]${reset}${dim} replay last update${reset}  ${bold}[k]${reset}${dim} corrupt last update${reset}  ${bold}[s]${reset}${dim} compact snapshot${reset}`);
  console.log(`${bold}[f]${reset}${dim} complete Meeting${reset}  ${bold}[w]${reset}${dim} batch prior documents${reset}  ${bold}[q]${reset}${dim} quit${reset}`);
};

const main = async (): Promise<void> => {
  const lab = await OpaqueMeetingProtocolLab.create();
  if (process.argv.includes('--drill')) {
    for (const result of lab.runDrill()) console.log(result);
    const tiptap = await runTiptapProbe();
    console.log(`${tiptap.passed ? 'PASS' : 'FAIL'} current Tiptap/Yjs multi-editor integration — ${tiptap.detail}`);
    const transport = runTransportProbe();
    console.log(`${transport.passed ? 'PASS' : 'FAIL'} same-origin WebSocket authentication — ${transport.detail}`);
    console.log(JSON.stringify(lab.state(), null, 2));
    return;
  }

  const input = createInterface({ input: process.stdin, output: process.stdout });
  let edit = 1;
  let dynamic = 1;
  const prompt = (): void => {
    render(lab);
    input.question('action> ', (answer) => {
      switch (answer.trim().toLowerCase()) {
        case 'g': lab.runDrill(); break;
        case 'd': {
          const connected = lab.state().clients.bob.connected;
          lab.setConnected('bob', !connected);
          break;
        }
        case 'e': lab.edit('alice', 'meeting/general-notes', `Alice edit ${edit++}`); break;
        case 'b': lab.edit('bob', 'appearance/appearance-a/minutes', `Bob minutes ${edit++}`); break;
        case 'a': {
          const id = `appearance-live-${dynamic++}`;
          lab.addAppearanceMutation('alice', `mutation:${id}`, id, 'preparation-context', 'Created with structure');
          break;
        }
        case 'p': lab.sendAwareness('alice', 'meeting/general-notes' as StableFragment); break;
        case 'r': lab.replayLastDelivery('bob'); break;
        case 'k': lab.corruptLastDelivery('bob'); break;
        case 's': lab.createClientSnapshot('alice', `snapshot:${Date.now()}`); break;
        case 'f': lab.completeMeeting(); break;
        case 'w': lab.bootstrapWorkspace('alice', 20); break;
        case 'q': input.close(); return;
      }
      prompt();
    });
  };
  prompt();
};

void main();
