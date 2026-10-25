const SUPABASE_URL = 'https://jopyswntrgtgbsezgwkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcHlzd250cmd0Z2JzZXpnd2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTc2NDIsImV4cCI6MjEwNzYzMzY0Mn0.C0JTJwg_zgPqT7JCyPVqqR3-lKMb2EQHFOUpVGdZD1s';

const tableBody = document.getElementById('usersTableBody');
const pendingTableBody = document.getElementById('pendingUsersTableBody');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const connectionStatus = document.getElementById('connectionStatus');
const connectionLabel = document.getElementById('connectionLabel');
const toggleAddAccountButton = document.getElementById('toggleAddAccountButton');
const addAccountForm = document.getElementById('addAccountForm');
const cancelAddAccountButton = document.getElementById('cancelAddAccountButton');
const addAccountMessage = document.getElementById('addAccountMessage');
const addAccountButton = addAccountForm.querySelector('button[type="submit"]');
const accountStatusInput = document.getElementById('accountStatus');
const editAccountPanel = document.getElementById('editAccountPanel');
const editAccountForm = document.getElementById('editAccountForm');
const editAccountMessage = document.getElementById('editAccountMessage');
const saveAccountChangesButton = document.getElementById('saveAccountChangesButton');
const changePasswordPanel = document.getElementById('changePasswordPanel');
const changePasswordForm = document.getElementById('changePasswordForm');
const changePasswordEmail = document.getElementById('changePasswordEmail');
const changePasswordValue = document.getElementById('changePasswordValue');
const changePasswordButton = document.getElementById('changePasswordButton');
const changePasswordMessage = document.getElementById('changePasswordMessage');
const changePasswordTitle = document.getElementById('changePasswordTitle');
const changePasswordDescription = document.getElementById('changePasswordDescription');
const cancelChangePasswordButton = document.getElementById('cancelChangePasswordButton');
const deleteConfirmationDialog = document.getElementById('deleteConfirmationDialog');
const deleteConfirmationEmail = document.getElementById('deleteConfirmationEmail');
const moderatorLoginPanel = document.getElementById('moderatorLoginPanel');
const moderatorWorkspace = document.getElementById('moderatorWorkspace');
const moderatorLoginForm = document.getElementById('moderatorLoginForm');
const moderatorAuthMessage = document.getElementById('moderatorAuthMessage');
const signInButton = document.getElementById('signInButton');
const moderatorMfaForm = document.getElementById('moderatorMfaForm');
const moderatorMfaInstructions = document.getElementById('moderatorMfaInstructions');
const moderatorOtpCode = document.getElementById('moderatorOtpCode');
const verifyModeratorMfaButton = document.getElementById('verifyModeratorMfaButton');
const moderatorMfaMessage = document.getElementById('moderatorMfaMessage');
const resendModeratorOtpButton = document.getElementById('resendModeratorOtpButton');
const cancelModeratorMfaButton = document.getElementById('cancelModeratorMfaButton');
const refreshAccountsButton = document.getElementById('refreshAccountsButton');
const refreshPendingAccountsButton = document.getElementById('refreshPendingAccountsButton');
const pendingTableView = document.getElementById('pendingTableView');
const moderatorFeedbackList = document.getElementById('moderatorFeedbackList');
const moderatorFeedbackCount = document.getElementById('moderatorFeedbackCount');
const moderatorFeedbackMessage = document.getElementById('moderatorFeedbackMessage');
const refreshModeratorFeedbackButton = document.getElementById('refreshModeratorFeedbackButton');
const feedbackSearchInput = document.getElementById('feedbackSearchInput');
const feedbackStatusFilter = document.getElementById('feedbackStatusFilter');
const feedbackSubjectFilter = document.getElementById('feedbackSubjectFilter');
const feedbackReplyAuthorFilter = document.getElementById('feedbackReplyAuthorFilter');
const deleteFeedbackDialog = document.getElementById('deleteFeedbackDialog');
const deleteFeedbackDescription = document.getElementById('deleteFeedbackDescription');

let accounts = [];
let feedbackItems = [];
let moderatorFeedbackRefreshTimer;
let moderatorSession = null;
let pendingModeratorEmail = '';
let pendingModeratorAccessToken = '';
let moderatorLockSessionId = '';
let otpCooldownTimer;
let moderatorLockHeartbeatTimer;
let moderatorLockHeartbeatInFlight = false;
let passwordFormMode = 'reset';

const MODERATOR_LOCK_HEARTBEAT_MS = 1_000;

const statusLabels = {
  verified: 'Đã xác minh',
  pending: 'Đang chờ',
  banned: 'Bị cấm sử dụng'
};

// gọi Supabase và kiểm tra kết quả
async function requestJson(url, options = {}, accessToken = SUPABASE_ANON_KEY) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const text = response.status === 204 ? '' : await response.text();
  let result = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }

  if (!response.ok) {
    const serverMessage = result && typeof result === 'object'
      ? result.message || result.error_description || result.details || result.hint || result.error
      : result;
    const method = options.method || 'GET';
    const message = serverMessage || `Supabase trả về HTTP ${response.status}.`;
    throw new Error(`${message} [${method} ${url}; HTTP ${response.status}]`);
  }
  return result;
}

// gửi request đăng nhập
async function authRequest(path, options = {}, accessToken = '') {
  return requestJson(`${SUPABASE_URL}/auth/v1/${path}`, options, accessToken || SUPABASE_ANON_KEY);
}

// check quyền moderator
function isModerator(user) {
  return user?.app_metadata?.role === 'moderator';
}

// đọc/lưu phiên trong trang
function readSession() {
  return moderatorSession;
}

// lưu phiên đăng nhập
function saveSession(session) {
  moderatorSession = session;
}

// xóa phiên đăng nhập
function clearSession() {
  moderatorSession = null;
}

// gọi RPC quản lý khóa moderator
// gọi RPC quản lý khóa moderator
async function callModeratorLockRpc(functionName, sessionId, accessToken) {
  return requestJson(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify({ p_session_id: sessionId })
  }, accessToken);
}

// dừng gia hạn khóa phiên
function stopModeratorLockHeartbeat() {
  window.clearInterval(moderatorLockHeartbeatTimer);
  moderatorLockHeartbeatTimer = null;
}

// dừng thao tác khi mất quyền quản lý
function loseModeratorLock() {
  stopModeratorLockHeartbeat();
  moderatorLockSessionId = '';
  pendingModeratorAccessToken = '';
  pendingModeratorEmail = '';
  clearSession();
  window.clearInterval(otpCooldownTimer);
  moderatorMfaForm.reset();
  moderatorMfaForm.hidden = true;
  showLogin('Phiên moderator này đã bị ngắt vì tài khoản đang đăng nhập ở nơi khác.', 'error');
}

// gia hạn khóa phiên moderator
async function renewModeratorLock(accessToken) {
  if (!moderatorLockSessionId) {
    throw new Error('Không tìm thấy khóa phiên moderator. Hãy đăng nhập lại.');
  }
  const renewed = await callModeratorLockRpc(
    'renew_moderator_session',
    moderatorLockSessionId,
    accessToken
  );
  if (!renewed) {
    loseModeratorLock();
    throw new Error('Tài khoản moderator này đang online ở nơi khác. Phiên hiện tại đã hết hiệu lực.');
  }
}

// tự gia hạn khóa khi trang còn mở
function startModeratorLockHeartbeat() {
  stopModeratorLockHeartbeat();
  moderatorLockHeartbeatTimer = window.setInterval(async () => {
    if (!moderatorLockSessionId || moderatorLockHeartbeatInFlight) return;
    moderatorLockHeartbeatInFlight = true;
    try {
      const session = moderatorSession ? await getSession() : null;
      const accessToken = session?.access_token || pendingModeratorAccessToken;
      if (accessToken) await renewModeratorLock(accessToken);
    } catch (error) {
      console.error('Không thể gia hạn phiên moderator:', error);
    } finally {
      moderatorLockHeartbeatInFlight = false;
    }
  }, MODERATOR_LOCK_HEARTBEAT_MS);
}

// chỉ cho một moderator quản lý cùng lúc
async function acquireModeratorLock(accessToken) {
  const sessionId = crypto.randomUUID();
  let acquired;
  try {
    acquired = await callModeratorLockRpc(
      'claim_moderator_session',
      sessionId,
      accessToken
    );
  } catch (error) {
    console.error('Không thể khóa phiên moderator:', error);
    throw new Error(shortAuthError(error, 'lease'));
  }
  if (!acquired) {
    throw new Error('Tài khoản moderator này đang online ở nơi khác. Hãy đóng phiên đó rồi thử lại. Nếu phiên đã đóng đột ngột, chờ tối đa 5 giây.');
  }
  moderatorLockSessionId = sessionId;
  pendingModeratorAccessToken = accessToken;
  startModeratorLockHeartbeat();
}

// trả khóa khi kết thúc phiên
async function releaseModeratorLock(accessToken = pendingModeratorAccessToken || moderatorSession?.access_token) {
  const sessionId = moderatorLockSessionId;
  stopModeratorLockHeartbeat();
  moderatorLockSessionId = '';
  pendingModeratorAccessToken = '';
  pendingModeratorEmail = '';
  if (!sessionId || !accessToken) return true;
  try {
    return await callModeratorLockRpc('release_moderator_session', sessionId, accessToken);
  } catch (error) {
    console.error('Không thể giải phóng phiên moderator:', error);
    return false;
  }
}

// đổi lỗi đăng nhập thành lời nhắc
function shortAuthError(error, context) {
  const message = String(error?.message || '').toLowerCase();
  if (context === 'lease' && (
    message.includes('claim_moderator_session')
    || message.includes('could not find the function')
  )) {
    return 'Chưa cấu hình khóa phiên moderator trên Supabase. Hãy chạy migration moderator-session-lock.sql.';
  }
  if (context === 'lease') return 'Không kiểm tra được phiên online của moderator. Vui lòng thử lại.';
  if (message.includes('too many requests') || message.includes('rate limit') || message.includes('http 429')) {
    return 'Quá nhiều yêu cầu. Chờ rồi thử lại.';
  }
  if (message.includes('invalid token') || message.includes('token has expired')) {
    return 'Mã OTP sai hoặc hết hạn. Gửi mã mới.';
  }
  if (message.includes('chưa được cấp quyền moderator')) {
    return 'Email này không phải moderator.';
  }
  if (context === 'login') {
    return message.includes('http 400') || message.includes('invalid login credentials')
      ? 'Sai email/mật khẩu hoặc email chưa xác minh.'
      : 'Không xác thực được. Thử lại sau.';
  }
  if (context === 'send') return 'Không gửi được OTP. Thử lại sau.';
  if (context === 'verify') return 'Không xác minh được OTP. Kiểm tra mã rồi thử lại.';
  return 'Đã xảy ra lỗi. Thử lại sau.';
}

// gửi mã OTP cho moderator
async function sendModeratorOtp(email) {
  if (!moderatorLockSessionId || !pendingModeratorAccessToken) {
    throw new Error('Phiên đăng nhập đã hết. Hãy đăng nhập lại.');
  }
  await renewModeratorLock(pendingModeratorAccessToken);
  try {
    await authRequest('otp', {
      method: 'POST',
      body: JSON.stringify({ email, create_user: false })
    });
  } catch (error) {
    console.error('Không thể gửi OTP moderator:', error);
    throw new Error(shortAuthError(error, 'send'));
  }
  pendingModeratorEmail = email;
}

// bắt đầu đăng nhập + kiểm tra mã 2 bước
async function beginModeratorSignIn(email, password) {
  let signInResult;
  try {
    signInResult = await authRequest('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  } catch (error) {
    console.error('Không thể xác thực email/mật khẩu moderator:', error);
    throw new Error(shortAuthError(error, 'login'));
  }

  if (!isModerator(signInResult.user)) {
    throw new Error('Email này chưa được cấp quyền moderator.');
  }

  await acquireModeratorLock(signInResult.access_token);
  try {
    await sendModeratorOtp(email);
  } catch (error) {
    await releaseModeratorLock(signInResult.access_token);
    throw error;
  }
}

// chuyển sang form nhập mã OTP
function showModeratorMfa(instructions) {
  moderatorLoginForm.hidden = true;
  moderatorMfaForm.hidden = false;
  moderatorMfaInstructions.textContent = instructions;
  moderatorMfaMessage.textContent = '';
  moderatorMfaMessage.className = 'form-message';
  moderatorOtpCode.value = '';
  moderatorOtpCode.focus();
  startModeratorOtpCooldown();
}

// đếm ngược trước khi gửi lại OTP
function startModeratorOtpCooldown() {
  window.clearInterval(otpCooldownTimer);
  let secondsRemaining = 60;
  resendModeratorOtpButton.disabled = true;
  resendModeratorOtpButton.textContent = `Gửi lại mã (${secondsRemaining}s)`;
  otpCooldownTimer = window.setInterval(() => {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      window.clearInterval(otpCooldownTimer);
      resendModeratorOtpButton.disabled = false;
      resendModeratorOtpButton.textContent = 'Gửi lại mã';
      return;
    }
    resendModeratorOtpButton.textContent = `Gửi lại mã (${secondsRemaining}s)`;
  }, 1000);
}

// đọc mức xác minh trong token
function getJwtAssuranceLevel(accessToken) {
  try {
    const encodedPayload = accessToken.split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedPayload = encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload));
    return payload.aal;
  } catch {
    return '';
  }
}

// xác minh mã đăng nhập moderator
async function verifyModeratorMfa(code) {
  if (!pendingModeratorEmail) {
    throw new Error('Phiên xác minh OTP đã hết. Hãy đăng nhập lại.');
  }
  const verified = await authRequest('verify', {
    method: 'POST',
    body: JSON.stringify({ email: pendingModeratorEmail, token: code, type: 'email' })
  });
  if (!isModerator(verified.user)) {
    throw new Error('Email này không phải moderator.');
  }
  if (getJwtAssuranceLevel(verified.access_token || '') !== 'aal1') {
    throw new Error('Supabase chưa xác nhận phiên đăng nhập email. Hãy gửi mã mới và thử lại.');
  }
  await renewModeratorLock(verified.access_token);
  saveSession({
    access_token: verified.access_token,
    refresh_token: verified.refresh_token,
    expires_at: Date.now() + verified.expires_in * 1000,
    user: verified.user
  });
  pendingModeratorEmail = '';
  window.clearInterval(otpCooldownTimer);
}

// lấy phiên moderator, cần thì làm mới
async function getSession() {
  let session = readSession();
  if (!session) return null;
  if (!isModerator(session.user) || getJwtAssuranceLevel(session.access_token) !== 'aal1') {
    clearSession();
    throw new Error('Phiên moderator chưa đăng nhập bằng OTP email. Hãy đăng nhập lại.');
  }

  if (session.expires_at <= Date.now() + 60_000) {
    try {
      const refreshed = await authRequest('token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!isModerator(refreshed.user)) {
        throw new Error('Tài khoản này không còn quyền moderator.');
      }
      if (getJwtAssuranceLevel(refreshed.access_token) !== 'aal1') {
        throw new Error('Phiên mới không còn mức xác minh email.');
      }
      session = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: Date.now() + refreshed.expires_in * 1000,
        user: refreshed.user
      };
      saveSession(session);
    } catch (error) {
      clearSession();
      throw new Error(`Phiên đăng nhập hết hạn. Hãy đăng nhập lại: ${error.message}`, { cause: error });
    }
  }
  return session;
}

// gọi chức năng quản trị trên Supabase
async function callModeratorRpc(functionName, args) {
  const session = await getSession();
  if (!session) throw new Error('Vui lòng đăng nhập moderator.');
  await renewModeratorLock(session.access_token);
  return requestJson(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(args)
  }, session.access_token);
}

// cập nhật trạng thái kết nối
function setConnectionState(state, message) {
  connectionStatus.dataset.state = state;
  connectionLabel.textContent = message;
}

// cập nhật số lượng theo trạng thái
function renderSummary() {
  document.getElementById('totalCount').textContent = accounts.length;
  document.getElementById('verifiedCount').textContent = accounts.filter(account => account.status === 'verified').length;
  document.getElementById('pendingCount').textContent = accounts.filter(account => account.status === 'pending').length;
  document.getElementById('bannedCount').textContent = accounts.filter(account => account.status === 'banned').length;
}

function setFeedbackSummaryCount(value) {
  document.getElementById('feedbackSummaryCount').textContent = value;
}

// lọc + vẽ ds tk
function renderAccounts(emptyMessage = 'Không có dữ liệu tài khoản.') {
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const pendingAccounts = accounts.filter(account => account.status === 'pending');
  const visiblePendingAccounts = pendingAccounts.filter(account => (
    account.email.includes(query)
      || account.account_name.toLowerCase().includes(query)
      || account.password.toLowerCase().includes(query)
  ));
  const visibleAccounts = accounts.filter(account => account.status !== 'pending' && (
    (account.email.includes(query) || account.account_name.toLowerCase().includes(query))
      && (selectedStatus === 'all' || account.status === selectedStatus)
  ));

  pendingTableBody.replaceChildren();
  document.getElementById('pendingResultCount').textContent = `${visiblePendingAccounts.length} tài khoản`;
  if (visiblePendingAccounts.length === 0) {
    const row = document.createElement('tr');
    const message = document.createElement('td');
    message.className = 'table-message';
    message.colSpan = 4;
    message.textContent = pendingAccounts.length
      ? 'Không tìm thấy tài khoản chờ duyệt phù hợp.'
      : (accounts.length ? 'Không có tài khoản nào đang chờ duyệt.' : emptyMessage);
    row.append(message);
    pendingTableBody.append(row);
  } else {
    for (const account of visiblePendingAccounts) {
      const row = document.createElement('tr');
      const email = document.createElement('td');
      const accountName = document.createElement('td');
      const password = document.createElement('td');
      const passwordValue = document.createElement('span');
      const passwordToggle = document.createElement('button');
      const actionCell = document.createElement('td');
      const editButton = document.createElement('button');
      const approveButton = document.createElement('button');
      const deleteButton = document.createElement('button');

      email.className = 'account-email';
      email.textContent = account.email;
      accountName.textContent = account.account_name;
      passwordValue.textContent = account.password ? '********' : '—';
      passwordToggle.type = 'button';
      passwordToggle.className = 'password-display-toggle';
      passwordToggle.innerHTML = '<img src="images/eye-closed.png" alt="">';
      passwordToggle.setAttribute('aria-pressed', 'false');
      passwordToggle.setAttribute('aria-label', `Hiện mật khẩu tài khoản ${account.email}`);
      passwordToggle.hidden = !account.password;
      passwordToggle.addEventListener('click', () => {
        const isVisible = passwordToggle.getAttribute('aria-pressed') !== 'true';
        passwordValue.textContent = isVisible ? account.password : '********';
        passwordToggle.querySelector('img').src = isVisible
          ? 'images/eye-open.png'
          : 'images/eye-closed.png';
        passwordToggle.setAttribute('aria-pressed', String(isVisible));
        passwordToggle.setAttribute(
          'aria-label',
          `${isVisible ? 'Ẩn' : 'Hiện'} mật khẩu tài khoản ${account.email}`
        );
      });
      password.append(passwordValue, passwordToggle);
      actionCell.className = 'account-actions';
      editButton.type = 'button';
      editButton.className = 'edit-account-button';
      editButton.dataset.email = account.email;
      editButton.setAttribute('aria-label', `Chỉnh sửa tài khoản ${account.email}`);
      editButton.textContent = 'Chỉnh sửa';
      approveButton.type = 'button';
      approveButton.className = 'approve-account-button';
      approveButton.dataset.email = account.email;
      approveButton.textContent = 'Duyệt';
      deleteButton.type = 'button';
      deleteButton.className = 'delete-account-button';
      deleteButton.dataset.email = account.email;
      deleteButton.setAttribute('aria-label', `Xóa tài khoản ${account.email}`);
      deleteButton.textContent = 'Xóa';
      actionCell.append(editButton, approveButton, deleteButton);
      row.append(email, accountName, password, actionCell);
      pendingTableBody.append(row);
    }
  }

  tableBody.replaceChildren();
  document.getElementById('resultCount').textContent = `${visibleAccounts.length} tài khoản`;
  if (visibleAccounts.length === 0) {
    const row = document.createElement('tr');
    const message = document.createElement('td');
    message.className = 'table-message';
    message.colSpan = 4;
    message.textContent = accounts.length ? 'Không tìm thấy tài khoản phù hợp.' : emptyMessage;
    row.append(message);
    tableBody.append(row);
    return;
  }

  for (const account of visibleAccounts) {
    const row = document.createElement('tr');
    const email = document.createElement('td');
    const accountName = document.createElement('td');
    const statusCell = document.createElement('td');
    const actionCell = document.createElement('td');
    const editButton = document.createElement('button');
    const changeButton = document.createElement('button');
    const deleteButton = document.createElement('button');

    email.className = 'account-email';
    actionCell.className = 'account-actions';
    email.textContent = account.email;
    accountName.textContent = account.account_name;
    const status = document.createElement('span');
    status.className = `status-pill${statusLabels[account.status] ? ` status-${account.status}` : ''}`;
    status.textContent = statusLabels[account.status] || 'Chưa rõ';
    statusCell.append(status);
    editButton.type = 'button';
    editButton.className = 'edit-account-button';
    editButton.dataset.email = account.email;
    editButton.setAttribute('aria-label', `Chỉnh sửa tài khoản ${account.email}`);
    editButton.textContent = 'Chỉnh sửa';
    changeButton.type = 'button';
    changeButton.className = 'change-password-button';
    changeButton.dataset.email = account.email;
    changeButton.textContent = 'Đặt mật khẩu';
    deleteButton.type = 'button';
    deleteButton.className = 'delete-account-button';
    deleteButton.dataset.email = account.email;
    deleteButton.setAttribute('aria-label', `Xóa tài khoản ${account.email}`);
    deleteButton.textContent = 'Xóa';
    actionCell.append(editButton, changeButton, deleteButton);
    row.append(email, accountName, statusCell, actionCell);
    tableBody.append(row);
  }
}

// hiện thông báo cho các form
function setFormMessage(message, state = '') {
  addAccountMessage.textContent = message;
  addAccountMessage.className = `form-message${state ? ` is-${state}` : ''}`;
}

// hiện thông báo đăng nhập
function setAuthMessage(message, state = '') {
  moderatorAuthMessage.textContent = message;
  moderatorAuthMessage.className = `form-message${state ? ` is-${state}` : ''}`;
}

// hiện thông báo đổi mật khẩu
function setChangePasswordMessage(message, state = '') {
  changePasswordMessage.textContent = message;
  changePasswordMessage.className = `form-message${state ? ` is-${state}` : ''}`;
}

// hiện thông báo sửa tk
function setEditAccountMessage(message, state = '') {
  editAccountMessage.textContent = message;
  editAccountMessage.className = `form-message${state ? ` is-${state}` : ''}`;
}

// chuyển giữa màn đăng nhập và quản lý
function showLogin(message = '', state = '') {
  moderatorLoginPanel.hidden = false;
  moderatorWorkspace.hidden = true;
  setAuthMessage(message, state);
}

// hiện trang quản lý
function showWorkspace() {
  moderatorLoginPanel.hidden = true;
  moderatorWorkspace.hidden = false;
}

// hiện form sửa tk chờ duyệt
function showPendingAccountEditor(panel) {
  pendingTableView.hidden = true;
  editAccountPanel.hidden = panel !== editAccountPanel;
  changePasswordPanel.hidden = panel !== changePasswordPanel;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// quay lại bảng tk chờ duyệt
function showPendingAccountTable() {
  editAccountPanel.hidden = true;
  changePasswordPanel.hidden = true;
  pendingTableView.hidden = false;
}

// đọc ds tk từ Supabase
async function loadAccounts() {
  setConnectionState('loading', 'Đang kết nối...');
  try {
    const session = await getSession();
    if (!session) throw new Error('Vui lòng đăng nhập moderator.');
    const result = await callModeratorRpc('list_managed_users', {});
    if (!Array.isArray(result)) throw new Error('Danh sách users không đúng định dạng.');
    accounts = result.map(account => ({
      email: String(account.email || '').trim().toLowerCase(),
      account_name: typeof account.account_name === 'string' ? account.account_name : '—',
      password: typeof account.password === 'string' ? account.password : '',
      status: typeof account.status === 'string' ? account.status.toLowerCase() : 'unknown'
    }));
    renderSummary();
    setConnectionState('online', 'Đã kết nối Supabase');
    renderAccounts();
    return true;
  } catch (error) {
    console.error('Không thể tải tài khoản:', error);
    setConnectionState('error', 'Không kết nối được');
    accounts = [];
    renderSummary();
    renderAccounts(`Không thể tải dữ liệu: ${error.message}`);
    return false;
  }
}

const feedbackStatusLabels = {
  submitted: 'Đã gửi',
  new: 'Đã gửi',
  in_progress: 'Đang xem xét',
  resolved: 'Đã hoàn tất',
  cancelled: 'Đã hủy'
};

function getFeedbackPriority(status) {
  return {
    submitted: 0,
    new: 0,
    in_progress: 1,
    cancelled: 2,
    resolved: 3
  }[status] ?? 5;
}

function getVisibleFeedback() {
  const query = feedbackSearchInput.value.trim().toLowerCase();
  const selectedStatus = feedbackStatusFilter.value;
  const selectedSubject = feedbackSubjectFilter.value;
  const selectedReplyAuthor = feedbackReplyAuthorFilter.value;
  return [...feedbackItems]
    .filter(item => {
      const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
      const matchesSubject = selectedSubject === 'all' || item.subject === selectedSubject;
      const matchesReplyAuthor = selectedReplyAuthor === 'all'
        || (selectedReplyAuthor === '__none__' && !item.moderator_reply)
        || (selectedReplyAuthor === '__unattributed__'
          && item.moderator_reply && !item.moderator_reply_by)
        || item.moderator_reply_by === selectedReplyAuthor;
      const searchableText = [
        item.email,
        item.subject,
        item.message,
        item.moderator_reply || '',
        item.moderator_reply_by || ''
      ].join(' ').toLowerCase();
      return matchesStatus && matchesSubject && matchesReplyAuthor
        && searchableText.includes(query);
    })
    .sort((left, right) => (
      getFeedbackPriority(left.status) - getFeedbackPriority(right.status)
      || new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    ));
}

function renderFeedbackReplyAuthorOptions() {
  const currentValue = feedbackReplyAuthorFilter.value;
  const authors = [...new Set(
    feedbackItems
      .map(item => item.moderator_reply_by)
      .filter(author => typeof author === 'string' && author.trim())
  )].sort((left, right) => left.localeCompare(right));
  const options = [
    ['all', 'Mọi người trả lời'],
    ...(feedbackItems.some(item => !item.moderator_reply)
      ? [['__none__', 'Chưa trả lời']]
      : []),
    ...(feedbackItems.some(item => item.moderator_reply && !item.moderator_reply_by)
      ? [['__unattributed__', 'Chưa ghi nhận người trả lời']]
      : []),
    ...authors.map(author => [author, author])
  ];
  const fragment = document.createDocumentFragment();
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fragment.append(option);
  }
  feedbackReplyAuthorFilter.replaceChildren(fragment);
  feedbackReplyAuthorFilter.value = options.some(([value]) => value === currentValue)
    ? currentValue
    : 'all';
}

function renderModeratorFeedback(message = '') {
  moderatorFeedbackList.replaceChildren();
  if (message) {
    const empty = document.createElement('p');
    empty.className = 'moderator-feedback-empty is-error';
    empty.textContent = message;
    moderatorFeedbackList.append(empty);
    moderatorFeedbackCount.textContent = 'Không tải được phản hồi';
    return;
  }
  const visibleFeedback = getVisibleFeedback();
  if (visibleFeedback.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'moderator-feedback-empty';
    empty.textContent = feedbackItems.length
      ? 'Không có phản hồi phù hợp với bộ lọc.'
      : 'Chưa có phản hồi nào.';
    moderatorFeedbackList.append(empty);
    moderatorFeedbackCount.textContent = `0/${feedbackItems.length} phản hồi`;
    return;
  }

  moderatorFeedbackCount.textContent = `${visibleFeedback.length}/${feedbackItems.length} phản hồi`;
  for (const item of visibleFeedback) {
    const article = document.createElement('article');
    article.className = 'moderator-feedback-card';
    const header = document.createElement('div');
    header.className = 'moderator-feedback-heading';
    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = item.subject;
    const email = document.createElement('p');
    email.className = 'moderator-feedback-email';
    email.textContent = item.email;
    titleGroup.append(title, email);
    const status = document.createElement('span');
    status.className = `feedback-status-badge feedback-status-${item.status}`;
    status.textContent = feedbackStatusLabels[item.status] || item.status;
    header.append(titleGroup, status);

    const details = document.createElement('details');
    details.className = 'moderator-feedback-details';
    details.open = false;
    const summary = document.createElement('summary');
    summary.textContent = 'Mở chi tiết';
    details.addEventListener('toggle', () => {
      summary.textContent = details.open ? 'Thu gọn' : 'Mở chi tiết';
    });
    const detailsBody = document.createElement('div');
    detailsBody.className = 'moderator-feedback-details-body';
    const messageText = document.createElement('div');
    messageText.className = 'moderator-feedback-content';
    const messageParagraph = document.createElement('p');
    messageParagraph.textContent = item.message;
    messageText.append(messageParagraph);
    const date = document.createElement('time');
    date.className = 'moderator-feedback-date';
    date.dateTime = item.created_at;
    date.textContent = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(item.created_at));

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'auth-secondary-button moderator-feedback-edit';
    editButton.textContent = 'Chỉnh sửa';

    const quickActions = document.createElement('div');
    quickActions.className = 'moderator-feedback-actions';
    for (const [statusValue, label] of [
      ['in_progress', 'Đang xem xét'],
      ['resolved', 'Đánh dấu hoàn tất'],
      ['cancelled', 'Hủy phản hồi']
    ]) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'auth-secondary-button';
      action.dataset.feedbackStatus = statusValue;
      action.classList.add('moderator-feedback-status-choice');
      action.setAttribute('aria-pressed', 'false');
      action.textContent = label;
      quickActions.append(action);
    }
    quickActions.hidden = true;

    const form = document.createElement('form');
    form.className = 'moderator-feedback-editor';
    form.dataset.feedbackId = item.id;
    form.dataset.savedStatus = item.status;
    form.dataset.feedbackStatus = '';
    form.hidden = true;
    const replyLabel = document.createElement('label');
    replyLabel.textContent = 'Trả lời sinh viên';
    const replyInput = document.createElement('textarea');
    replyInput.name = 'reply';
    replyInput.maxLength = 200;
    replyInput.rows = 3;
    replyInput.placeholder = 'Nhập phản hồi (không bắt buộc)...';
    replyInput.defaultValue = item.moderator_reply || '';
    replyInput.value = item.moderator_reply || '';
    replyLabel.append(replyInput);
    const replyCharacterCount = document.createElement('span');
    replyCharacterCount.className = 'moderator-feedback-character-count';
    replyCharacterCount.setAttribute('aria-live', 'polite');
    replyCharacterCount.textContent = `${replyInput.value.length}/200`;
    replyLabel.append(replyCharacterCount);
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'add-account-button';
    saveButton.textContent = 'Cập nhật';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'cancel-password-button moderator-feedback-cancel';
    cancelButton.textContent = 'Hủy';
    const editorDeleteButton = document.createElement('button');
    editorDeleteButton.type = 'button';
    editorDeleteButton.className = 'delete-account-button moderator-feedback-delete moderator-feedback-delete-edit';
    editorDeleteButton.dataset.feedbackId = item.id;
    editorDeleteButton.textContent = 'Xóa';
    const editorActions = document.createElement('div');
    editorActions.className = 'moderator-feedback-editor-actions';
    editorActions.append(saveButton, cancelButton, editorDeleteButton);
    const editMessage = document.createElement('p');
    editMessage.className = 'moderator-feedback-edit-message';
    editMessage.setAttribute('role', 'status');
    form.append(quickActions, replyLabel, editorActions, editMessage);
    detailsBody.append(messageText, date);
    if (item.moderator_reply) {
      const savedReply = document.createElement('div');
      savedReply.className = 'moderator-feedback-reply';
      const savedReplyHeading = document.createElement('strong');
      savedReplyHeading.textContent = item.moderator_reply_by
        ? `Trả lời từ ${item.moderator_reply_by}`
        : 'Trả lời đã gửi';
      const savedReplyText = document.createElement('p');
      savedReplyText.textContent = item.moderator_reply;
      savedReply.append(savedReplyHeading, savedReplyText);
      detailsBody.append(savedReply);
    }
    detailsBody.append(form);

    const maintenance = document.createElement('div');
    maintenance.className = 'moderator-feedback-maintenance';
    maintenance.append(editButton);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-account-button moderator-feedback-delete moderator-feedback-delete-outside';
    deleteButton.dataset.feedbackId = item.id;
    deleteButton.textContent = 'Xóa';
    maintenance.append(deleteButton);
    details.append(summary, detailsBody);
    article.append(header, details, maintenance);
    moderatorFeedbackList.append(article);
  }
}

function feedbackErrorMessage(error) {
  const message = String(error?.message || error);
  const normalized = message.toLowerCase();
  if (normalized.includes('feedback item not found')) {
    return 'Phản hồi này không còn tồn tại. Có thể sinh viên hoặc moderator đã xóa; hãy dùng danh sách đã làm mới.';
  }
  if (normalized.includes('could not find the function')
    || normalized.includes('function') && normalized.includes('schema cache')) {
    return 'Supabase chưa nhận diện RPC phản hồi. Hãy chạy lại feedback-system.sql trong SQL Editor rồi tải lại trang.';
  }
  if (normalized.includes('moderator access is required')) {
    return 'Phiên này không có quyền moderator. Hãy đăng xuất/đăng nhập lại sau khi cấp quyền moderator.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'Không thể kết nối tới máy chủ. Kiểm tra kết nối mạng rồi thử lại.';
  }
  if (normalized.includes('moderator reply cannot exceed 200 characters')) {
    return 'Phản hồi của quản trị viên vượt quá giới hạn 200 ký tự.';
  }
  if (error?.status === 400) {
    return 'Yêu cầu không hợp lệ hoặc phản hồi đã thay đổi. Hãy làm mới danh sách rồi thử lại.';
  }
  if (error?.status >= 500) {
    return 'Máy chủ đang gặp sự cố khi xử lý phản hồi. Vui lòng thử lại sau.';
  }
  return 'Không thể xử lý phản hồi lúc này. Vui lòng thử lại; nếu lỗi tiếp diễn, hãy kiểm tra kết nối hoặc liên hệ quản trị viên.';
}

async function loadModeratorFeedback() {
  try {
    const result = await callModeratorRpc('list_feedback_for_moderator', {});
    if (!Array.isArray(result)) {
      throw new Error('Danh sách phản hồi từ Supabase không đúng định dạng.');
    }
    feedbackItems = result;
    setFeedbackSummaryCount(feedbackItems.length);
    renderFeedbackReplyAuthorOptions();
    renderModeratorFeedback();
    return true;
  } catch (error) {
    console.error('Không thể tải phản hồi moderator:', error);
    feedbackItems = [];
    setFeedbackSummaryCount('—');
    renderFeedbackReplyAuthorOptions();
    renderModeratorFeedback(`Không thể tải phản hồi: ${feedbackErrorMessage(error)}`);
    return false;
  }
}

function startModeratorFeedbackRefresh() {
  window.clearInterval(moderatorFeedbackRefreshTimer);
  moderatorFeedbackRefreshTimer = window.setInterval(() => {
    const hasOpenEditor = moderatorFeedbackList.querySelector(
      '.moderator-feedback-editor:not([hidden])'
    );
    if (!document.hidden && !hasOpenEditor && !moderatorWorkspace.hidden) {
      void loadModeratorFeedback();
    }
  }, 60_000);
}

async function deleteModeratorFeedback(button) {
  const feedbackId = Number(button.dataset.feedbackId);
  const item = feedbackItems.find(feedback => Number(feedback.id) === feedbackId);
  if (!item) return;

  deleteFeedbackDescription.textContent = `${item.subject} — ${item.email}`;
  deleteFeedbackDialog.returnValue = '';
  deleteFeedbackDialog.showModal();
  const confirmed = await new Promise(resolve => {
    deleteFeedbackDialog.addEventListener('close', () => {
      resolve(deleteFeedbackDialog.returnValue === 'delete');
    }, { once: true });
  });
  if (!confirmed) return;

  button.disabled = true;
  moderatorFeedbackMessage.textContent = 'Đang xóa phản hồi...';
  moderatorFeedbackMessage.className = 'feedback-admin-message';
  try {
    await callModeratorRpc('delete_feedback_for_moderator', {
      p_feedback_id: feedbackId
    });
    moderatorFeedbackMessage.textContent = 'Đã xóa phản hồi.';
    moderatorFeedbackMessage.classList.add('is-success');
    await loadModeratorFeedback();
  } catch (error) {
    console.error('Không thể xóa phản hồi:', error);
    const isMissing = String(error?.message || error).toLowerCase().includes('feedback item not found');
    if (isMissing) await loadModeratorFeedback();
    moderatorFeedbackMessage.textContent = isMissing
      ? feedbackErrorMessage(error)
      : `Không thể xóa phản hồi: ${feedbackErrorMessage(error)}`;
    moderatorFeedbackMessage.classList.add('is-error');
    button.disabled = false;
  }
}

async function saveModeratorFeedback(feedbackId, status, reply, button) {
  if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0) {
    throw new Error('Mã phản hồi không hợp lệ.');
  }
  if (!['in_progress', 'resolved', 'cancelled'].includes(status)) {
    throw new Error('Chọn trạng thái trước khi cập nhật.');
  }
  button.disabled = true;
  moderatorFeedbackMessage.textContent = 'Đang lưu cập nhật phản hồi...';
  moderatorFeedbackMessage.className = 'feedback-admin-message';
  try {
    await callModeratorRpc('update_feedback_for_moderator', {
      p_feedback_id: feedbackId,
      p_status: status,
      p_moderator_reply: reply || null
    });
    moderatorFeedbackMessage.textContent = 'Đã cập nhật phản hồi.';
    moderatorFeedbackMessage.classList.add('is-success');
    await loadModeratorFeedback();
  } catch (error) {
    console.error('Không thể cập nhật phản hồi:', error);
    const isMissing = String(error?.message || error).toLowerCase().includes('feedback item not found');
    if (isMissing) await loadModeratorFeedback();
    moderatorFeedbackMessage.textContent = isMissing
      ? feedbackErrorMessage(error)
      : `Không thể cập nhật phản hồi: ${feedbackErrorMessage(error)}`;
    moderatorFeedbackMessage.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
}

async function handleModeratorFeedbackUpdate(event) {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)
    || !form.classList.contains('moderator-feedback-editor')) {
    return;
  }
  const reply = form.elements.namedItem('reply');
  const saveButton = form.querySelector('button[type="submit"]');
  const editMessage = form.querySelector('.moderator-feedback-edit-message');
  if (!form.dataset.feedbackStatus) {
    editMessage.textContent = 'Hãy chọn một trạng thái trước khi cập nhật.';
    editMessage.classList.add('is-error');
    return;
  }
  editMessage.textContent = '';
  editMessage.classList.remove('is-error');
  await saveModeratorFeedback(
    Number(form.dataset.feedbackId),
    form.dataset.feedbackStatus,
    reply.value.trim(),
    saveButton
  );
}

function handleModeratorFeedbackAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest('button')
    : null;
  if (!button) return;

  const article = button.closest('.moderator-feedback-card');
  if (!article) return;
  if (button.classList.contains('moderator-feedback-delete')) {
    void deleteModeratorFeedback(button);
    return;
  }
  const form = article.querySelector('.moderator-feedback-editor');
  const quickActions = article.querySelector('.moderator-feedback-actions');
  const editButton = article.querySelector('.moderator-feedback-edit');
  const outsideDeleteButton = article.querySelector('.moderator-feedback-delete-outside');
  const editMessage = form.querySelector('.moderator-feedback-edit-message');

  if (button.classList.contains('moderator-feedback-edit')) {
    article.querySelector('.moderator-feedback-details').open = true;
    const currentStatus = form.dataset.savedStatus;
    const selectedChoice = quickActions.querySelector(
      `[data-feedback-status="${currentStatus}"]`
    );
    form.dataset.feedbackStatus = selectedChoice ? currentStatus : '';
    form.hidden = false;
    quickActions.hidden = false;
    editButton.hidden = true;
    outsideDeleteButton.hidden = true;
    editMessage.textContent = '';
    editMessage.classList.remove('is-error');
    quickActions.querySelectorAll('.moderator-feedback-status-choice').forEach(choice => {
      const isSelected = choice === selectedChoice;
      choice.setAttribute('aria-pressed', String(isSelected));
      choice.classList.toggle('is-selected', isSelected);
    });
    form.elements.namedItem('reply').focus();
    return;
  }

  if (button.classList.contains('moderator-feedback-status-choice')) {
    form.dataset.feedbackStatus = button.dataset.feedbackStatus;
    quickActions.querySelectorAll('.moderator-feedback-status-choice').forEach(choice => {
      const isSelected = choice === button;
      choice.setAttribute('aria-pressed', String(isSelected));
      choice.classList.toggle('is-selected', isSelected);
    });
    editMessage.textContent = '';
    editMessage.classList.remove('is-error');
    return;
  }

  if (button.classList.contains('moderator-feedback-cancel')) {
    form.reset();
    form.dataset.feedbackStatus = '';
    form.hidden = true;
    quickActions.hidden = true;
    editButton.hidden = false;
    outsideDeleteButton.hidden = false;
    editMessage.textContent = '';
    editMessage.classList.remove('is-error');
    quickActions.querySelectorAll('.moderator-feedback-status-choice').forEach(choice => {
      choice.setAttribute('aria-pressed', 'false');
      choice.classList.remove('is-selected');
    });
  }

  moderatorFeedbackList.addEventListener('input', event => {
    const reply = event.target instanceof HTMLTextAreaElement
      ? event.target.closest('.moderator-feedback-editor textarea')
      : null;
    if (!reply) return;
    const counter = reply.parentElement.querySelector('.moderator-feedback-character-count');
    if (counter) counter.textContent = `${reply.value.length}/200`;
  });
}

// check mật khẩu trước khi lưu
function validatePassword(password) {
  if (!/^[\x21-\x7E]{6,20}$/.test(password)) {
    return 'Mật khẩu phải dài từ 6 đến 20 ký tự, không có dấu cách hoặc dấu tiếng Việt.';
  }
  return '';
}

// chuẩn hóa tên để so sánh trùng
function normalizeAccountName(accountName) {
  return accountName.trim().toLowerCase();
}

// đổi lỗi lưu tk thành lời nhắc
function accountSaveErrorMessage(error, fallback) {
  if (error.message.includes('Use the approve action')) {
    return 'Hãy dùng nút “Duyệt” để duyệt tài khoản đang chờ và lưu mật khẩu.';
  }
  if (error.message.includes('users_account_name_unique')
    || error.message.includes('users_account_name_normalized_unique')) {
    return 'Tên tài khoản này đã được sử dụng.';
  }
  if (error.message.includes('users_pkey') || error.message.includes('users_email_unique')) {
    return 'Email này đã có trong danh sách.';
  }
  if (error.message.includes('Account name already exists')) {
    return 'Tên tài khoản này đã được sử dụng.';
  }
  if (error.message.includes('Email already exists')) {
    return 'Email này đã có trong danh sách.';
  }
  return `${fallback}: ${error.message}`;
}

// thêm tk mới
async function handleAddAccount(event) {
  event.preventDefault();
  const email = document.getElementById('accountEmail').value.trim().toLowerCase();
  const accountName = document.getElementById('accountName').value.trim();
  const password = document.getElementById('accountPassword').value;
  const status = accountStatusInput.value;

  if (!/^[^\s@]+@student\.ctu\.edu\.vn$/.test(email)) {
    setFormMessage('Chỉ chấp nhận email hợp lệ có đuôi @student.ctu.edu.vn.', 'error');
    return;
  }
  if (!/^[A-Za-z0-9_]{3,16}$/.test(accountName)) {
    setFormMessage('Tên tài khoản phải dài 3–16 ký tự, chỉ gồm chữ không dấu, số và dấu gạch dưới (_), không có dấu cách.', 'error');
    return;
  }
  if (!password) {
    setFormMessage('Vui lòng nhập mật khẩu cho tài khoản.', 'error');
    return;
  }
  if (!['verified', 'pending', 'banned'].includes(status)) {
    setFormMessage('Vui lòng chọn trạng thái hợp lệ.', 'error');
    return;
  }
  if (accounts.some(account => account.email === email)) {
    setFormMessage('Email này đã có trong danh sách.', 'error');
    return;
  }
  if (accounts.some(account => normalizeAccountName(account.account_name) === normalizeAccountName(accountName))) {
    setFormMessage('Tên tài khoản này đã được sử dụng.', 'error');
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    setFormMessage(passwordError, 'error');
    return;
  }

  addAccountButton.disabled = true;
  setFormMessage('Đang lưu tài khoản...');
  try {
    await callModeratorRpc('create_user_with_password', {
      p_email: email,
      p_account_name: accountName,
      p_status: status,
      p_password: password
    });
    addAccountForm.reset();
    resetPasswordVisibility(document.getElementById('accountPassword'));
    accountStatusInput.value = 'verified';
    setFormMessage('Đã tạo tài khoản và lưu mật khẩu.', 'success');
    addAccountForm.hidden = true;
    toggleAddAccountButton.setAttribute('aria-expanded', 'false');
    toggleAddAccountButton.textContent = 'Thêm tài khoản';
    await loadAccounts();
  } catch (error) {
    console.error('Không thể tạo tài khoản:', error);
    setFormMessage(accountSaveErrorMessage(error, 'Không thể lưu tài khoản'), 'error');
  } finally {
    addAccountButton.disabled = false;
  }
}

// mở form đổi mật khẩu
async function handleChangePasswordAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest('.change-password-button')
    : null;
  if (!button) return;

  changePasswordForm.reset();
  resetPasswordVisibility(changePasswordValue);
  changePasswordEmail.value = button.dataset.email || '';
  passwordFormMode = 'reset';
  changePasswordTitle.textContent = 'Đặt mật khẩu mới';
  changePasswordDescription.textContent = 'Mật khẩu hiện tại được lưu trong hồ sơ tài khoản và có thể xem qua trang đăng ký đã xác minh email.';
  changePasswordButton.textContent = 'Lưu mật khẩu mới';
  changePasswordMessage.textContent = '';
  showPendingAccountEditor(changePasswordPanel);
  changePasswordValue.focus();
}

// xóa tk
// xóa tk đã xác nhận
async function handleDeleteAccountAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest('.delete-account-button')
    : null;
  if (!button || button.disabled) return;

  const email = button.dataset.email || '';
  const account = accounts.find(item => item.email === email);
  if (!account) return;

  deleteConfirmationEmail.textContent = email;
  deleteConfirmationDialog.returnValue = '';
  deleteConfirmationDialog.showModal();
  const shouldDelete = await new Promise(resolve => {
    deleteConfirmationDialog.addEventListener('close', () => {
      resolve(deleteConfirmationDialog.returnValue === 'delete');
    }, { once: true });
  });

  if (!shouldDelete) {
    return;
  }

  button.disabled = true;
  try {
    await callModeratorRpc('delete_managed_user', { p_email: email });
    setFormMessage(`Đã xóa tài khoản ${email} khỏi danh sách quản lý.`, 'success');
    await loadAccounts();
  } catch (error) {
    console.error('Không thể xóa tài khoản:', error);
    window.alert(`Không thể xóa tài khoản ${email}: ${error.message}`);
    button.disabled = false;
  }
}

// duyệt tk đang chờ
function handleApproveAccountAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest('.approve-account-button')
    : null;
  if (!button) return;

  const account = accounts.find(item => item.email === button.dataset.email && item.status === 'pending');
  if (!account) return;

  changePasswordForm.reset();
  resetPasswordVisibility(changePasswordValue);
  changePasswordEmail.value = account.email;
  passwordFormMode = 'approve';
  changePasswordTitle.textContent = 'Duyệt tài khoản & đặt mật khẩu';
  changePasswordDescription.textContent = '';
  changePasswordButton.textContent = 'Duyệt & lưu mật khẩu';
  setChangePasswordMessage('');
  showPendingAccountEditor(changePasswordPanel);
  changePasswordValue.focus();
}

// mở form sửa thông tin tk
function handleEditAccountAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest('.edit-account-button')
    : null;
  if (!button) return;

  const account = accounts.find(item => item.email === button.dataset.email);
  if (!account) return;

  editAccountForm.reset();
  document.getElementById('editAccountOriginalEmail').value = account.email;
  document.getElementById('editAccountEmail').value = account.email;
  document.getElementById('editAccountName').value = account.account_name;
  document.getElementById('editAccountStatus').value = account.status;
  setEditAccountMessage('');
  showPendingAccountEditor(editAccountPanel);
  document.getElementById('editAccountEmail').focus();
}

// lưu thông tin đã sửa
async function handleEditAccount(event) {
  event.preventDefault();

  const originalEmail = document.getElementById('editAccountOriginalEmail').value;
  const email = document.getElementById('editAccountEmail').value.trim().toLowerCase();
  const accountName = document.getElementById('editAccountName').value.trim();
  const status = document.getElementById('editAccountStatus').value;
  const currentAccount = accounts.find(account => account.email === originalEmail);

  if (!/^[^\s@]+@student\.ctu\.edu\.vn$/.test(email)) {
    setEditAccountMessage('Chỉ chấp nhận email hợp lệ có đuôi @student.ctu.edu.vn.', 'error');
    return;
  }
  if (!/^[A-Za-z0-9_]{3,16}$/.test(accountName)) {
    setEditAccountMessage('Tên tài khoản phải dài 3–16 ký tự, chỉ gồm chữ không dấu, số và dấu gạch dưới (_), không có dấu cách.', 'error');
    return;
  }
  if (accounts.some(account => account.email !== originalEmail && account.email === email)) {
    setEditAccountMessage('Email này đã có trong danh sách.', 'error');
    return;
  }
  if (currentAccount
    && normalizeAccountName(currentAccount.account_name) !== normalizeAccountName(accountName)
    && accounts.some(account => (
      account.email !== originalEmail
        && normalizeAccountName(account.account_name) === normalizeAccountName(accountName)
    ))) {
    setEditAccountMessage('Tên tài khoản này đã được sử dụng.', 'error');
    return;
  }

  saveAccountChangesButton.disabled = true;
  setEditAccountMessage('Đang lưu thay đổi...');
  try {
    await callModeratorRpc('update_user_details', {
      p_original_email: originalEmail,
      p_email: email,
      p_account_name: accountName,
      p_status: status
    });
    editAccountForm.reset();
    showPendingAccountTable();
    setFormMessage('Đã cập nhật thông tin tài khoản.', 'success');
    await loadAccounts();
  } catch (error) {
    console.error('Không thể cập nhật tài khoản:', error);
    setEditAccountMessage(accountSaveErrorMessage(error, 'Không thể lưu thay đổi'), 'error');
  } finally {
    saveAccountChangesButton.disabled = false;
  }
}

// cập nhật mật khẩu
async function handleChangePassword(event) {
  event.preventDefault();
  const isApproving = passwordFormMode === 'approve';
  const email = changePasswordEmail.value;
  const password = changePasswordValue.value;
  const passwordError = validatePassword(password);
  if (passwordError) {
    setChangePasswordMessage(passwordError, 'error');
    return;
  }

  changePasswordButton.disabled = true;
  setChangePasswordMessage(isApproving
    ? 'Đang duyệt tài khoản và lưu mật khẩu...'
    : 'Đang cập nhật mật khẩu...');
  try {
    if (isApproving) {
      await callModeratorRpc('approve_pending_user', {
        p_email: email,
        p_password: password
      });
    } else {
      await callModeratorRpc('set_user_password', {
        p_email: email,
        p_password: password
      });
    }
    changePasswordForm.reset();
    resetPasswordVisibility(changePasswordValue);
    showPendingAccountTable();
    passwordFormMode = 'reset';
    changePasswordTitle.textContent = 'Đặt mật khẩu mới';
    changePasswordDescription.textContent = 'Mật khẩu hiện tại được lưu trong hồ sơ tài khoản và có thể xem qua trang đăng ký đã xác minh email.';
    changePasswordButton.textContent = 'Lưu mật khẩu mới';
    setFormMessage(isApproving
      ? `Đã duyệt tài khoản ${email} và lưu mật khẩu mới.`
      : `Đã cập nhật mật khẩu cho ${email}. Mật khẩu cũ đã bị thay thế.`, 'success');
    await loadAccounts();
  } catch (error) {
    console.error('Không thể cập nhật mật khẩu:', error);
    setChangePasswordMessage(`Không thể đổi mật khẩu: ${error.message}`, 'error');
  } finally {
    changePasswordButton.disabled = false;
  }
}

// ẩn lại mật khẩu sau khi đóng form
function resetPasswordVisibility(input) {
  input.type = 'password';
  const toggle = document.querySelector(`.password-visibility-toggle[aria-controls="${input.id}"]`);
  if (!toggle) return;
  toggle.querySelector('img').src = 'images/eye-closed.png';
  toggle.setAttribute('aria-label', 'Hiện mật khẩu');
  toggle.setAttribute('aria-pressed', 'false');
}

document.querySelectorAll('.password-visibility-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!input) return;
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    toggle.querySelector('img').src = isVisible
      ? 'images/eye-closed.png'
      : 'images/eye-open.png';
    toggle.setAttribute('aria-label', `${isVisible ? 'Hiện' : 'Ẩn'} mật khẩu`);
    toggle.setAttribute('aria-pressed', String(!isVisible));
  });
});

moderatorOtpCode.addEventListener('input', () => {
  moderatorOtpCode.value = moderatorOtpCode.value.replace(/\D/g, '').slice(0, 8);
});

// đăng nhập moderator
async function handleModeratorLogin(event) {
  event.preventDefault();
  signInButton.disabled = true;
  setAuthMessage('Đang kiểm tra thông tin đăng nhập...');
  try {
    const email = document.getElementById('moderatorEmail').value.trim().toLowerCase();
    const password = document.getElementById('moderatorPassword').value;
    if (!email || !password) throw new Error('Nhập email và mật khẩu moderator.');
    await beginModeratorSignIn(email, password);
    showModeratorMfa(`Đã gửi OTP tới ${email}. Kiểm tra hộp thư và Spam.`);
    setAuthMessage('');
  } catch (error) {
    console.error('Không thể đăng nhập moderator:', error);
    setAuthMessage(error.message, 'error');
  } finally {
    const passwordInput = document.getElementById('moderatorPassword');
    passwordInput.value = '';
    resetPasswordVisibility(passwordInput);
    signInButton.disabled = false;
  }
}

// xử lý gửi mã 2 bước
async function handleModeratorMfa(event) {
  event.preventDefault();
  const code = moderatorOtpCode.value.replace(/\D/g, '');
  if (!/^\d{8}$/.test(code)) {
    moderatorMfaMessage.textContent = 'Nhập mã OTP gồm đúng 8 chữ số.';
    return;
  }

  verifyModeratorMfaButton.disabled = true;
  moderatorMfaMessage.textContent = 'Đang xác minh OTP...';
  try {
    await verifyModeratorMfa(code);
    moderatorMfaForm.reset();
    moderatorMfaForm.hidden = true;
    moderatorLoginForm.reset();
    showWorkspace();
    await loadAccounts();
    await loadModeratorFeedback();
    startModeratorFeedbackRefresh();
  } catch (error) {
    console.error('Không thể xác minh OTP moderator:', error);
    moderatorMfaMessage.textContent = shortAuthError(error, 'verify');
  } finally {
    verifyModeratorMfaButton.disabled = false;
  }
}

const moderatorTabs = [
  {
    button: document.getElementById('accountsPanelToggle'),
    panel: document.getElementById('accountsPanelContent')
  },
  {
    button: document.getElementById('feedbackPanelToggle'),
    panel: document.getElementById('feedbackPanelContent')
  }
];

function selectModeratorTab(selectedTab, moveFocus = false) {
  for (const tab of moderatorTabs) {
    const isSelected = tab === selectedTab;
    tab.button.setAttribute('aria-selected', String(isSelected));
    tab.button.tabIndex = isSelected ? 0 : -1;
    tab.panel.hidden = !isSelected;
  }
  if (moveFocus) selectedTab.button.focus();
}

moderatorTabs.forEach((tab, index) => {
  tab.button.addEventListener('click', () => selectModeratorTab(tab));
  tab.button.addEventListener('keydown', event => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % moderatorTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + moderatorTabs.length) % moderatorTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = moderatorTabs.length - 1;
    else return;
    event.preventDefault();
    selectModeratorTab(moderatorTabs[nextIndex], true);
  });
});

searchInput.addEventListener('input', () => renderAccounts());
statusFilter.addEventListener('change', () => renderAccounts());
toggleAddAccountButton.addEventListener('click', () => {
  const isOpening = addAccountForm.hidden;
  addAccountForm.hidden = !isOpening;
  toggleAddAccountButton.setAttribute('aria-expanded', String(isOpening));
  toggleAddAccountButton.textContent = isOpening ? 'Đóng biểu mẫu' : 'Thêm tài khoản';
  if (isOpening) {
    setFormMessage('');
    document.getElementById('accountEmail').focus();
  }
});
cancelAddAccountButton.addEventListener('click', () => {
  addAccountForm.reset();
  resetPasswordVisibility(document.getElementById('accountPassword'));
  accountStatusInput.value = 'verified';
  setFormMessage('');
  addAccountForm.hidden = true;
  toggleAddAccountButton.setAttribute('aria-expanded', 'false');
  toggleAddAccountButton.textContent = 'Thêm tài khoản';
  toggleAddAccountButton.focus();
});
moderatorLoginForm.addEventListener('submit', handleModeratorLogin);
moderatorMfaForm.addEventListener('submit', handleModeratorMfa);
refreshAccountsButton.addEventListener('click', async () => {
  if (refreshAccountsButton.disabled) return;
  refreshAccountsButton.disabled = true;
  refreshAccountsButton.textContent = 'Đang tải...';
  try {
    await loadAccounts();
  } finally {
    refreshAccountsButton.disabled = false;
    refreshAccountsButton.textContent = 'Làm mới';
  }
});
refreshPendingAccountsButton.addEventListener('click', async () => {
  if (refreshPendingAccountsButton.disabled) return;
  refreshPendingAccountsButton.disabled = true;
  refreshPendingAccountsButton.textContent = 'Đang tải...';
  try {
    await loadAccounts();
  } finally {
    refreshPendingAccountsButton.disabled = false;
    refreshPendingAccountsButton.textContent = 'Làm mới';
  }
});
resendModeratorOtpButton.addEventListener('click', async () => {
  if (resendModeratorOtpButton.disabled || !pendingModeratorEmail) return;
  resendModeratorOtpButton.disabled = true;
  resendModeratorOtpButton.textContent = 'Đang gửi...';
  try {
    await sendModeratorOtp(pendingModeratorEmail);
    moderatorMfaMessage.textContent = 'Đã gửi mã mới. Chỉ mã mới nhất còn hiệu lực.';
    startModeratorOtpCooldown();
  } catch (error) {
    console.error('Không thể gửi lại OTP moderator:', error);
    moderatorMfaMessage.textContent = shortAuthError(error, 'send');
    resendModeratorOtpButton.disabled = false;
    resendModeratorOtpButton.textContent = 'Gửi lại mã';
  }
});
cancelModeratorMfaButton.addEventListener('click', () => {
  void releaseModeratorLock();
  window.clearInterval(otpCooldownTimer);
  moderatorMfaForm.reset();
  moderatorMfaForm.hidden = true;
  resendModeratorOtpButton.disabled = false;
  resendModeratorOtpButton.textContent = 'Gửi lại mã';
  moderatorLoginForm.hidden = false;
  moderatorAuthMessage.textContent = '';
});
addAccountForm.addEventListener('submit', handleAddAccount);
const handleAccountTableAction = event => {
  handleEditAccountAction(event);
  handleChangePasswordAction(event);
  handleApproveAccountAction(event);
  void handleDeleteAccountAction(event);
};
tableBody.addEventListener('click', handleAccountTableAction);
pendingTableBody.addEventListener('click', handleAccountTableAction);
editAccountForm.addEventListener('submit', handleEditAccount);
document.getElementById('cancelEditAccountButton').addEventListener('click', () => {
  editAccountForm.reset();
  setEditAccountMessage('');
  showPendingAccountTable();
});
changePasswordForm.addEventListener('submit', handleChangePassword);
moderatorFeedbackList.addEventListener('submit', handleModeratorFeedbackUpdate);
moderatorFeedbackList.addEventListener('click', handleModeratorFeedbackAction);
feedbackSearchInput.addEventListener('input', () => renderModeratorFeedback());
feedbackStatusFilter.addEventListener('change', () => renderModeratorFeedback());
feedbackSubjectFilter.addEventListener('change', () => renderModeratorFeedback());
feedbackReplyAuthorFilter.addEventListener('change', () => renderModeratorFeedback());
refreshModeratorFeedbackButton.addEventListener('click', async () => {
  refreshModeratorFeedbackButton.disabled = true;
  try {
    await loadModeratorFeedback();
  } finally {
    refreshModeratorFeedbackButton.disabled = false;
  }
});
cancelChangePasswordButton.addEventListener('click', () => {
  changePasswordForm.reset();
  resetPasswordVisibility(changePasswordValue);
  showPendingAccountTable();
  passwordFormMode = 'reset';
  changePasswordTitle.textContent = 'Đặt mật khẩu mới';
  changePasswordDescription.textContent = 'Mật khẩu hiện tại được lưu trong hồ sơ tài khoản và có thể xem qua trang đăng ký đã xác minh email.';
  changePasswordButton.textContent = 'Lưu mật khẩu mới';
  setChangePasswordMessage('');
});

// mở trang: khôi phục phiên nếu có
async function initializeModeratorPage() {
  try {
    const session = await getSession();
    if (!session) {
      setConnectionState('offline', 'Đăng nhập để quản lí');
      showLogin();
      return;
    }
    showWorkspace();
    await loadAccounts();
    await loadModeratorFeedback();
    startModeratorFeedbackRefresh();
  } catch (error) {
    console.error('Không thể khôi phục phiên moderator:', error);
    setConnectionState('error', 'Cần đăng nhập lại');
    showLogin(error.message, 'error');
  }
}

initializeModeratorPage();
