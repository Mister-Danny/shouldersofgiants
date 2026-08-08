import { $, $$, esc } from '../shared/utils.js';
import { State } from './state.js';
import { battleNodes, milestoneSource, milestoneUsage } from './milestones.js';
import { moveMilestone, deleteMilestone, addMilestone } from './commands.js';

/* ── Map-specific modal flows ─────────────────────────────────────────────
   The generic art-picker modal lives in shared/ (both editors will use it);
   these two don't generalise — they're about maps and milestones. Neither
   needs render.js: the milestone CRUD in commands.js already ends with
   requestRender() for the main stage, so this module's own job is only to
   redraw the MODAL's own body (#modal-body), which render() never touches. */

/* ── Help ─────────────────────────────────────────────────────────────────
   Written for someone who does not program. This lives in the toolbar rather
   than in a README because the toolbar is where the question gets asked. */
export function showHelp() {
  $('#modal-title').textContent = 'How to use the map editor';
  $('#modal-body').innerHTML = `
    <div class="help">
      <h3>The short version</h3>
      <ol>
        <li>Drag things where you want them.</li>
        <li>Click <b>Save to map-data.js</b>.</li>
        <li>Reload the game tab to see it.</li>
      </ol>
      <p>You cannot break the game by dragging. Positions are the only thing
         this tool can change.</p>

      <h3>Moving things</h3>
      <p>Click and drag any node. The small gold circle is the spot it is
         actually pinned to — the artwork around it is usually much bigger, so
         judge position by the circle, not the picture.</p>
      <p>For fine adjustment, click a node once and use the <b>arrow keys</b>.
         Each press moves it a tiny amount; hold <b>Shift</b> for bigger steps.</p>

      <h3>Walking routes</h3>
      <p>A route is the path the explorer walks between two places, so you can
         keep her out of lakes and off mountains.</p>
      <p><b>Every pair of places is already joined by a straight line.</b> You
         don't create routes — you bend the ones that need bending.</p>
      <ol>
        <li>Click <b>Routes</b> at the top of the right-hand panel.</li>
        <li>Click the two places you want the route between — or pick the pair
            from the Routes list below.</li>
        <li>The line lights up yellow. <b>Click the line</b> to add a bend
            wherever you clicked, then drag bends to shape it.</li>
        <li>Click a bend and press Delete to remove it. Remove them all and it
            goes back to a straight line.</li>
      </ol>
      <p>Routes work in both directions — shape it once and the walk back
         follows the same path in reverse.</p>
      <p>The gold circle marked <b>spawn</b> is where the player arrives on that
         map. It counts as a place, so you can route from it, and you can drag
         it if they're landing somewhere awkward.</p>

      <h3>Adding a node</h3>
      <p><b>+ Add Node</b> → pick a picture → give it a name. It appears in the
         middle of the map; drag it where you want. A node is either a
         <b>battle</b> or a <b>market</b> — those are the only two kinds.</p>
      <p class="warn"><b>Important:</b> a node you add will look right and
         animate, but <b>nothing happens when a player clicks it</b>. Making it
         open a shop or start a battle still needs a programming change. The
         Inspector tells you which nodes are in that state. Adding it here is
         step one of two — tell Claude what it should do and it wires up the rest.</p>

      <h3>Scenery</h3>
      <p><b>+ Add Scenery</b> drops in topography — huts, granaries, ruins. It's
         decorative: never clickable, always painted behind the nodes. You can
         rotate and mirror each piece so a row of huts doesn't look stamped out,
         and <b>Duplicate</b> is the quick way to dot a riverbank.</p>

      <h3>The story slider — this is the important one</h3>
      <p>The slider under the map is <b>when</b>. Drag it and the map rebuilds
         to show that point in the game.</p>
      <p>Every node and every piece of scenery can be set to
         <b>appear from</b> a story moment and <b>disappear at</b> one. That's
         how a region has a locked version and an unlocked version without you
         building it twice:</p>
      <ol>
        <li>Scenery with no settings shows the whole game long.</li>
        <li>Egypt's plain mud huts <i>disappear at</i> "Nebuchadnezzar defeated".</li>
        <li>The grand houses <i>appear from</i> that same moment.</li>
        <li>So the settlement visibly grows up the moment Egypt opens.</li>
      </ol>
      <p>Things that haven't appeared yet are shown faded, so you can still drag
         them into position long before the player will ever see them. Tick
         <b>hide what's not visible yet</b> to see the map exactly as a player
         would at that moment.</p>
      <h3>Adding story moments</h3>
      <p>Click <b>Edit story…</b> next to the slider. You'll see every moment in
         order, what makes each one happen, and how many things depend on it.</p>
      <p>To add one, give it a name and pick <b>which battle</b> it follows and
         <b>which win</b>:</p>
      <ul>
        <li><b>Serf</b> — opens the next node <i>on the same map</i>.</li>
        <li><b>Giant</b> — opens the <i>next region</i>. Use this for the last
            battle of a map.</li>
      </ul>
      <p>That's the whole rule, and picking it here is all it takes — the game
         already records those wins, so a moment made this way works with no
         programming.</p>
      <p>Use ↑ and ↓ to put it in the right place in the story. Deleting one
         tells you what depends on it first, and clears those settings for you
         if you go ahead.</p>
      <p>"Something else (needs code)" is for moments the game marks in its own
         way — the older ones in Mesopotamia work like that. Don't invent one:
         a moment nothing sets keeps its nodes hidden forever.</p>

      <h3>If you make a mess</h3>
      <p><b>Cmd + Z</b> undoes, as many times as you like, right back to how
         things were when you opened the editor. Nothing is written to disk
         until you press Save.</p>
      <p>If you already saved and want the previous version back, ask Claude —
         the file before your last save is kept automatically.</p>

      <h3>Publishing your changes</h3>
      <p>Saving updates the game on <i>this</i> computer only. Getting it onto
         the real site is a separate step — ask Claude to commit and push when
         you're happy with how things look.</p>
    </div>`;
  $('#modal-ok').hidden = true;
  const close = () => { $('#modal').hidden = true; $('#modal-ok').hidden = false; };
  $('#modal-cancel').textContent = 'Close';
  $('#modal-cancel').onclick = $('#modal-x').onclick = () => {
    close();
    $('#modal-cancel').textContent = 'Cancel';
  };
  $('#modal').hidden = false;
}

/* ── Milestone editor ─────────────────────────────────────────────────────
   Story moments are global, not per-map, so this lives beside the scrubber
   rather than in the per-map sidebar. */
export function showMilestones() {
  $('#modal-title').textContent = 'Story moments';
  $('#modal-ok').hidden = true;
  $('#modal-cancel').textContent = 'Close';
  const close = () => {
    $('#modal').hidden = true;
    $('#modal-ok').hidden = false;
    $('#modal-cancel').textContent = 'Cancel';
  };
  $('#modal-cancel').onclick = $('#modal-x').onclick = close;
  $('#modal').hidden = false;
  drawMilestones();
}

function drawMilestones() {
  const ms = State.doc.milestones || [];
  const battles = battleNodes();

  const rows = ms.map((m, i) => {
    const src = milestoneSource(m);
    const used = milestoneUsage(m.id).length;
    // 'start' is the implicit beginning — reordering or deleting it would be
    // meaningless, so it is shown but not editable.
    const locked = m.id === 'start';
    return `<li class="${locked ? 'locked' : ''}">
      <span class="ms-num">${i + 1}</span>
      <span class="ms-main">
        <b>${esc(m.label || m.id)}</b>
        <span class="ms-src ${src.custom ? 'custom' : ''}">${esc(src.text)}</span>
      </span>
      <span class="ms-used">${used ? used + ' use' + (used > 1 ? 's' : '') : 'unused'}</span>
      <span class="ms-btns">
        <button data-up="${i}"   ${i <= 1 ? 'disabled' : ''} title="earlier">↑</button>
        <button data-down="${i}" ${i === 0 || i === ms.length - 1 ? 'disabled' : ''} title="later">↓</button>
        <button data-del="${i}" class="del" ${locked ? 'disabled' : ''} title="delete">✕</button>
      </span></li>`;
  }).join('');

  $('#modal-body').innerHTML = `
    <p class="note">These are the moments the story slider walks through, in order.
      Anything on a map can be set to appear or disappear at one of them.</p>
    <ul class="ms-list">${rows}</ul>
    <div class="ms-add">
      <h4>Add a story moment</h4>
      <div class="f"><label>name</label>
        <input id="ms-label" placeholder="e.g. Hatshepsut defeated"></div>
      <div class="f"><label>what makes it happen</label>
        <select id="ms-src">
          <option value="battle">winning a battle</option>
          <option value="custom">something else (needs code) …</option>
        </select></div>
      <div id="ms-battle-fields">
        <div class="f2">
          <div class="f"><label>battle</label>
            <select id="ms-hook">
              ${battles.map(b => `<option value="${esc(b.hook)}">${esc(b.name || b.id)} (${esc(b.mapId)})</option>`).join('')}
              ${battles.length ? '' : '<option value="">— no battle nodes with a hook yet —</option>'}
            </select></div>
          <div class="f"><label>which win</label>
            <select id="ms-tier">
              <option value="serf">Serf — opens the next node here</option>
              <option value="giant">Giant — opens the next region</option>
            </select></div>
        </div>
      </div>
      <div id="ms-custom-fields" hidden>
        <div class="f"><label>flag name</label>
          <input id="ms-flag" placeholder="sog_something_complete"></div>
        <p class="warn">A flag nothing sets keeps its nodes hidden forever. Use this
          only for something game code already writes — otherwise pick a battle above.</p>
      </div>
      <div class="rowbtns"><button class="primary" id="ms-add">Add</button></div>
    </div>`;

  $$('.ms-btns button').forEach(b => {
    if (b.dataset.up   != null) b.onclick = () => { if (moveMilestone(+b.dataset.up, -1)) drawMilestones(); };
    if (b.dataset.down != null) b.onclick = () => { if (moveMilestone(+b.dataset.down, +1)) drawMilestones(); };
    if (b.dataset.del  != null) b.onclick = () => { if (deleteMilestone(+b.dataset.del)) drawMilestones(); };
  });
  $('#ms-src').onchange = e => {
    $('#ms-battle-fields').hidden = e.target.value !== 'battle';
    $('#ms-custom-fields').hidden = e.target.value !== 'custom';
  };
  $('#ms-add').onclick = () => { if (addMilestone()) drawMilestones(); };
}
