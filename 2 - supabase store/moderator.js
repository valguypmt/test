const SUPABASE_URL = 'https://jopyswntrgtgbsezgwkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcHlzd250cmd0Z2JzZXpnd2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTc2NDIsImV4cCI6MjEwNzYzMzY0Mn0.C0JTJwg_zgPqT7JCyPVqqR3-lKMb2EQHFOUpVGdZD1s';

const tableBody = document.getElementById('usersTableBody');
const searchInput = document.getElementById('searchInput');
const addAccountForm = document.getElementById('addAccountForm');
const addAccountButton = addAccountForm.querySelector('button[type="submit"]');
const accountStatusInput = document.getElementById('accountStatus');
const changePasswordPanel = document.getElementById('changePasswordPanel');
const changePasswordForm = document.getElementById('changePasswordForm');
const changePasswordEmail = document.getElementById('changePasswordEmail');
const changePasswordValue = document.getElementById('changePasswordValue');
const changePasswordButton = document.getElementById('changePasswordButton');
const cancelChangePasswordButton = document.getElementById('cancelChangePasswordButton');
const moderatorLoginPanel = document.getElementById('moderatorLoginPanel');
const moderatorWorkspace = document.getElementById('moderatorWorkspace');
const moderatorLoginForm = document.getElementById('moderatorLoginForm');
const signInButton = document.getElementById('signInButton');

// ds tk + phiên đăng nhập
let accounts = [];
let moderatorSession = null;

const statusLabels = {
  verified: 'Verified',
  pending: 'Pending',
  banned: 'Banned'
};

// gọi Supabase, đổi kết quả về json
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
    const message = result && typeof result === 'object'
      ? result.message || result.error_description || result.details || result.hint || result.error
      : result;
    throw new Error(message || `Supabase trả về HTTP ${response.status}.`);
  }
  return result;
}

async function authRequest(path, options = {}, accessToken = '') {
  return requestJson(`${SUPABASE_URL}/auth/v1/${path}`, options, accessToken || SUPABASE_ANON_KEY);
}

// kiểm tra quyền moderator
function isModerator(user) {
  return user?.app_metadata?.role === 'moderator';
}

// lấy phiên đăng nhập
function readSession() {
  return moderatorSession;
}

function saveSession(session) {
  moderatorSession = session;
}

function clearSession() {
  moderatorSession = null;
}

async function signInModerator(email, password) {
  const result = await authRequest('token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (!isModerator(result.user)) {
    throw new Error('Tài khoản này chưa được cấp quyền moderator.');
  }
  saveSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Date.now() + result.expires_in * 1000,
    user: result.user
  });
}

// lấy phiên còn hạn, cần thì làm mới
async function getSession() {
  let session = readSession();
  if (!session) return null;
  if (!isModerator(session.user)) {
    clearSession();
    throw new Error('Tài khoản này không có quyền moderator. Hãy đăng nhập lại.');
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

// gọi chức năng dành cho moderator
async function callModeratorRpc(functionName, args) {
  const session = await getSession();
  if (!session) throw new Error('Vui lòng đăng nhập moderator.');
  return requestJson(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(args)
  }, session.access_token);
}

// lọc + vẽ ds tk
function renderAccounts() {
  const query = searchInput.value.trim().toLowerCase();
  const visibleAccounts = accounts.filter(account => (
    account.email.includes(query) || account.account_name.toLowerCase().includes(query)
  ));

  tableBody.replaceChildren();
  if (visibleAccounts.length === 0) return;

  for (const account of visibleAccounts) {
    const row = document.createElement('tr');
    const email = document.createElement('td');
    const accountName = document.createElement('td');
    const statusCell = document.createElement('td');
    const actionCell = document.createElement('td');
    const changeButton = document.createElement('button');

    email.className = 'account-email';
    email.textContent = account.email;
    accountName.textContent = account.account_name;
    statusCell.className = 'account-status';
    statusCell.textContent = statusLabels[account.status] || 'Unknown';
    changeButton.type = 'button';
    changeButton.className = 'change-password-button';
    changeButton.dataset.email = account.email;
    changeButton.textContent = 'Password';
    actionCell.append(changeButton);
    row.append(email, accountName, statusCell, actionCell);
    tableBody.append(row);
  }
}

// chuyển giữa đăng nhập và trang quản lý
function showLogin() {
  moderatorLoginPanel.hidden = false;
  moderatorWorkspace.hidden = true;
}

function showWorkspace() {
  moderatorLoginPanel.hidden = true;
  moderatorWorkspace.hidden = false;
}

async function loadAccounts() {
  try {
    // đọc ds tk
    const session = await getSession();
    if (!session) throw new Error('Vui lòng đăng nhập moderator.');
    const query = new URLSearchParams({
      select: 'email,account_name,status',
      order: 'email.asc'
    });
    const result = await requestJson(
      `${SUPABASE_URL}/rest/v1/users?${query}`,
      {},
      session.access_token
    );
    if (!Array.isArray(result)) throw new Error('Danh sách users không đúng định dạng.');
    accounts = result.map(account => ({
      email: String(account.email || '').trim().toLowerCase(),
      account_name: typeof account.account_name === 'string' ? account.account_name : '—',
      status: typeof account.status === 'string' ? account.status.toLowerCase() : 'unknown'
    }));
    renderAccounts();
    return true;
  } catch (error) {
    // báo lỗi tải ds
    console.error('Không thể tải tài khoản:', error);
    accounts = [];
    renderAccounts();
    return false;
  }
}

// thêm tk mới
async function handleAddAccount(event) {
  event.preventDefault();
  const email = document.getElementById('accountEmail').value.trim().toLowerCase();
  const accountName = document.getElementById('accountName').value.trim();
  const password = document.getElementById('accountPassword').value;
  const status = accountStatusInput.value;

  addAccountButton.disabled = true;
  try {
    // tạo tk bằng RPC
    await callModeratorRpc('create_user_with_password', {
      p_email: email,
      p_account_name: accountName,
      p_status: status,
      p_password: password
    });
    addAccountForm.reset();
    accountStatusInput.value = 'verified';
    await loadAccounts();
  } catch (error) {
    console.error('Không thể tạo tài khoản:', error);
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
  changePasswordEmail.value = button.dataset.email || '';
  changePasswordPanel.hidden = false;
  changePasswordPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  changePasswordValue.focus();
}

// lưu mật khẩu mới
async function handleChangePassword(event) {
  event.preventDefault();
  const email = changePasswordEmail.value;
  const password = changePasswordValue.value;

  changePasswordButton.disabled = true;
  try {
    await callModeratorRpc('set_user_password', {
      p_email: email,
      p_password: password
    });
    changePasswordForm.reset();
    changePasswordPanel.hidden = true;
  } catch (error) {
    console.error('Không thể cập nhật mật khẩu:', error);
  } finally {
    changePasswordButton.disabled = false;
  }
}

// đăng nhập moderator
async function handleModeratorLogin(event) {
  event.preventDefault();
  signInButton.disabled = true;
  try {
    await signInModerator(
      document.getElementById('moderatorEmail').value.trim(),
      document.getElementById('moderatorPassword').value
    );
    moderatorLoginForm.reset();
    showWorkspace();
    await loadAccounts();
  } catch (error) {
    console.error('Không thể đăng nhập moderator:', error);
  } finally {
    signInButton.disabled = false;
  }
}

// gõ là lọc, bấm là xử lý
searchInput.addEventListener('input', () => renderAccounts());
moderatorLoginForm.addEventListener('submit', handleModeratorLogin);
addAccountForm.addEventListener('submit', handleAddAccount);
tableBody.addEventListener('click', handleChangePasswordAction);
changePasswordForm.addEventListener('submit', handleChangePassword);
cancelChangePasswordButton.addEventListener('click', () => {
  changePasswordForm.reset();
  changePasswordPanel.hidden = true;
});

// mở trang: kiểm tra phiên cũ
async function initializeModeratorPage() {
  try {
    const session = await getSession();
    if (!session) {
      showLogin();
      return;
    }
    showWorkspace();
    await loadAccounts();
  } catch (error) {
    console.error('Không thể khôi phục phiên moderator:', error);
    showLogin();
  }
}

initializeModeratorPage();
