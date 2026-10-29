'use strict';
(() => {
  const fileId = new URLSearchParams(location.search).get('file');
  if (fileId === null) return;
  const status = document.getElementById('viewerStatus');
  const loginButton = document.getElementById('viewerLogin');
  const pickerButton = document.getElementById('viewerPicker');
  const refreshButton = document.getElementById('viewerRefresh');
  const logoutButton = document.getElementById('viewerLogout');
  const account = document.getElementById('viewerAccount');
  const viewer = window.JuiceClassicViewer;
  const core = window.JuiceCore;
  const clientId = '1095634620472-blghk96rqsjbusfob1hpgstf88qoaunb.apps.googleusercontent.com';
  const scope = 'https://www.googleapis.com/auth/drive.file';
  const projectNumber = '1095634620472';
  const apiKey = window.JuiceDriveViewerConfig?.apiKey || '';
  const fileUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  let token = null;
  let identity = null;
  let version = null;
  let lastSuccess = null;
  let lastModified = null;
  let session = 0;
  let inFlight = false;
  let blocked = false;
  let expiryTimer = null;
  let pollTimer = null;

  document.getElementById('viewerLocalLoad').hidden = true;
  loginButton.hidden = false;
  account.hidden = false;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    loginButton.disabled = true;
    status.textContent = '唯讀網址的 Drive file ID 格式不正確。';
    return;
  }
  status.textContent = '此連結指向受限制的 Drive 白板。請登入已獲檢視權限的 Google 帳號。';

  const time = value => value ? new Date(value).toLocaleString('zh-TW') : '尚未確認';
  function report(message) {
    status.textContent = `${message} · 資料更新：${time(lastModified)} · 最後檢查：${time(lastSuccess)}`;
  }
  function stop() {
    clearTimeout(expiryTimer);
    clearInterval(pollTimer);
    pollTimer = null;
  }
  function clearSession(message) {
    session++;
    stop();
    token = null;
    identity = null;
    version = null;
    lastSuccess = null;
    lastModified = null;
    blocked = false;
    inFlight = false;
    viewer.clear();
    account.textContent = '';
    loginButton.hidden = false;
    pickerButton.hidden = true;
    refreshButton.hidden = true;
    logoutButton.hidden = true;
    status.textContent = message;
  }
  async function driveGet(url, accessToken) {
    return core.request(url,{method:'GET'},accessToken);
  }
  async function check() {
    if (!token || blocked || inFlight || document.hidden) return;
    const currentSession = session;
    const accessToken = token.access_token;
    inFlight = true;
    refreshButton.disabled = true;
    try {
      const metadata = await (await driveGet(`${fileUrl}?fields=id,name,mimeType,modifiedTime,version,trashed`,accessToken)).json();
      if (currentSession !== session) return;
      if (metadata.trashed) { const error = new Error('檔案已移到垃圾桶'); error.status = 404; throw error; }
      if (metadata.mimeType !== 'application/json') throw new Error('檔案不是 Juice JSON 白板');
      if (metadata.version !== version) {
        const raw = await (await driveGet(`${fileUrl}?alt=media`,accessToken)).text();
        if (currentSession !== session) return;
        const next = core.normalize(core.parse(raw));
        if (currentSession !== session) return;
        viewer.load(next,metadata.name || 'Drive 白板',version !== null);
        version = metadata.version;
      }
      lastModified = metadata.modifiedTime;
      lastSuccess = Date.now();
      pickerButton.hidden = true;
      report('已讀取最新 Drive 版本；此頁只能檢視，不能編輯');
    } catch (error) {
      if (currentSession !== session) return;
      if (error.status === 401) {
        clearSession('Google 授權已過期。請重新登入；白板內容已從此分頁清除。');
      } else if (error.status === 403 || error.status === 404) {
        const hadBoard = viewer.hasBoard();
        viewer.clear();
        version = null;
        blocked = hadBoard;
        pickerButton.hidden = hadBoard;
        report(hadBoard ? '檔案權限已失效或檔案不存在，已停止讀取並清除內容。請切換帳號' : '無法讀取指定檔案。請確認帳號有檢視權，並按「授權指定檔案」');
      } else {
        report(viewer.hasBoard() ? `目前顯示舊版本；檢查失敗：${error.message}` : `無法載入白板：${error.message}`);
      }
    } finally {
      if (currentSession === session) {
        inFlight = false;
        refreshButton.disabled = !token || blocked;
      }
    }
  }
  async function login() {
    if (!window.google?.accounts?.oauth2) { status.textContent = 'Google 登入服務尚未載入，請稍後再試。'; return; }
    clearSession('正在登入 Google…');
    const currentSession = session;
    const client = google.accounts.oauth2.initTokenClient({client_id:clientId,scope,prompt:'select_account',callback:async response => {
      if (currentSession !== session) return;
      if (response.error || !response.access_token) { status.textContent = 'Google 登入未完成，請重試。'; return; }
      try {
        const result = await (await driveGet('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress,displayName)',response.access_token)).json();
        if (currentSession !== session) return;
        if (!result.user?.permissionId) throw new Error('無法確認目前 Google 帳號');
        identity = result.user;
        token = response;
        account.textContent = identity.emailAddress || identity.displayName || '已登入 Google';
        loginButton.hidden = true;
        logoutButton.hidden = false;
        refreshButton.hidden = false;
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => clearSession('Google 授權已到期，請重新登入。'),Math.max(1000,(Number(response.expires_in) || 3600)*1000));
        pollTimer = setInterval(() => { if (!document.hidden) check(); },30000);
        await check();
      } catch (error) {
        if (currentSession === session) clearSession(`Google 登入失敗：${error.message}`);
      }
    },error_callback:() => { if (currentSession === session) status.textContent = 'Google 授權未完成，請重試。'; }});
    client.requestAccessToken({prompt:'select_account'});
  }
  function openPicker() {
    if (!token) return;
    if (!apiKey) { report('尚未設定 Google Picker API key；目前不能完成指定檔案授權'); return; }
    if (!window.gapi?.load) { report('Google Picker 尚未載入，請稍後重試'); return; }
    const currentSession = session;
    gapi.load('picker', {callback:() => {
      if (currentSession !== session || !token || !window.google?.picker) return;
      const picker = new google.picker.PickerBuilder()
        .addView(new google.picker.DocsView(google.picker.ViewId.DOCS).setMode(google.picker.DocsViewMode.LIST))
        .setOAuthToken(token.access_token).setDeveloperKey(apiKey).setAppId(projectNumber).setOrigin(location.origin)
        .setCallback(result => {
          if (currentSession !== session || result.action !== google.picker.Action.PICKED) return;
          if (!result.docs?.some(document => document.id === fileId)) { report('請在 Picker 中選取此連結對應的 Drive 檔案'); return; }
          blocked = false;
          check();
        }).build();
      picker.setVisible(true);
    }});
  }
  loginButton.addEventListener('click',login);
  logoutButton.addEventListener('click',() => clearSession('已切換帳號。請使用獲授權的 Google 帳號重新登入。'));
  pickerButton.addEventListener('click',openPicker);
  refreshButton.addEventListener('click',check);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) check(); });
})();
