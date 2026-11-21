const API = '/api';
const $ = id => document.getElementById(id);
const form = $('pairForm');
const phone = $('phoneNumber');
const connectButton = $('connectButton');
const message = $('message');
const codePanel = $('codePanel');
const pairCode = $('pairCode');
const copyCode = $('copyCode');
const statusText = $('statusText');
const statusDot = $('statusDot');
$('year').textContent = new Date().getFullYear();

let guest = null;
let creatingGuest = null;
function setMessage(text, error = false) {
  message.textContent = text;
  message.style.color = error ? '#ff9292' : '#9299a8';
}
function saveGuest(data) {
  guest = data;
  localStorage.setItem('captainGuest', JSON.stringify(data));
}
async function createGuest() {
  if (creatingGuest) return creatingGuest;
  creatingGuest = (async () => {
    const response = await fetch(`${API}/guest/session`, { method: 'POST', headers: {'Content-Type':'application/json'} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not start a secure guest session.');
    saveGuest(data);
    return data;
  })();
  try { return await creatingGuest; } finally { creatingGuest = null; }
}
async function ensureGuest() {
  if (!guest) {
    try { guest = JSON.parse(localStorage.getItem('captainGuest') || 'null'); } catch { guest = null; }
  }
  if (!guest?.accessToken || !guest?.refreshToken) return createGuest();
  if (guest.expiresAt && Date.now() > (guest.expiresAt * 1000) - 60000) {
    const response = await fetch(`${API}/guest/refresh`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:guest.refreshToken})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { localStorage.removeItem('captainGuest'); guest = null; return createGuest(); }
    saveGuest(data);
  }
  return guest;
}
async function api(path, options = {}) {
  const session = await ensureGuest();
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${session.accessToken}`, ...(options.body ? {'Content-Type':'application/json'} : {}) } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { localStorage.removeItem('captainGuest'); guest = null; throw new Error('Your temporary session expired. Refresh the page and try again.'); }
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const phoneNumber = phone.value.trim();
  if (!/^\+?[0-9\s()-]{8,20}$/.test(phoneNumber)) { setMessage('Enter a valid number with your country code.', true); return; }
  connectButton.disabled = true;
  connectButton.querySelector('span').textContent = 'Preparing secure connection…';
  codePanel.classList.add('hidden');
  setMessage('Contacting WhatsApp securely. This can take a few seconds…');
  try {
    const result = await api('/whatsapp/connect', {method:'POST',body:JSON.stringify({phoneNumber})});
    if (result.pairingCode) {
      pairCode.textContent = result.pairingCode;
      pairCode.dataset.code = result.pairingCode;
      codePanel.classList.remove('hidden');
      setMessage('Pairing code generated. Enter it in WhatsApp Linked devices.');
      await refreshStatus();
    } else {
      setMessage('Connection is starting. Refresh status in a moment.');
    }
  } catch (error) { setMessage(error.message, true); }
  finally { connectButton.disabled = false; connectButton.querySelector('span').textContent = 'Generate pairing code'; }
});
copyCode.addEventListener('click', async () => {
  const code = pairCode.dataset.code || pairCode.textContent;
  try { await navigator.clipboard.writeText(code); copyCode.textContent = 'COPIED'; setTimeout(() => copyCode.textContent = 'COPY', 1600); }
  catch { setMessage('Select the code and copy it manually.', true); }
});
async function refreshStatus() {
  statusText.textContent = 'CHECKING STATUS';
  try {
    const data = await api('/whatsapp/status');
    statusText.textContent = data.connected ? `CONNECTED${data.phoneNumber ? ` · ${data.phoneNumber}` : ''}` : data.status === 'connecting' ? 'CONNECTING' : data.status === 'connectionFailed' || data.status === 'recoveryRequired' ? 'CONNECTION NEEDS ATTENTION' : 'NOT CONNECTED';
    statusDot.classList.toggle('good', !!data.connected);
  } catch (error) { statusText.textContent = 'SESSION NOT READY'; setMessage(error.message, true); }
}
$('refreshStatus').addEventListener('click', refreshStatus);
(async () => {
  connectButton.disabled = true;
  setMessage('Preparing your private pairing session…');
  try { await ensureGuest(); setMessage('Your private session is ready. Enter your WhatsApp number to continue.'); await refreshStatus(); }
  catch (error) { setMessage(error.message, true); }
  finally { connectButton.disabled = false; }
})();
