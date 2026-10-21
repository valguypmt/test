const SUPABASE_URL = 'https://jopyswntrgtgbsezgwkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcHlzd250cmd0Z2JzZXpnd2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTc2NDIsImV4cCI6MjEwNzYzMzY0Mn0.C0JTJwg_zgPqT7JCyPVqqR3-lKMb2EQHFOUpVGdZD1s';

const tableBody = document.getElementById('usersTableBody');
const pendingTableBody = document.getElementById('pendingUsersTableBody');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const connectionStatus = document.getElementById('connectionStatus');
const connectionLabel = document.getElementById('connectionLabel');
const addAccountForm = document.getElementById('addAccountForm');
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

let accounts = [];
let moderatorSession = null;
let passwordFormMode = 'reset';

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
    const message = result && typeof result === 'object'
      ? result.message || result.error_description || result.details || result.hint || result.error
      : result;
    throw new Error(message || `Supabase trả về HTTP ${response.status}.`);
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

// đăng nhập và kiểm tra quyền
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

// lấy phiên moderator, cần thì làm mới
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

// gọi chức năng quản trị trên Supabase
async function callModeratorRpc(functionName, args) {
  const session = await getSession();
  if (!session) throw new Error('Vui lòng đăng nhập moderator.');
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

// lọc + vẽ ds tk
function renderAccounts(emptyMessage = 'Không có dữ liệu tài khoản.') {
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const pendingAccounts = accounts.filter(account => account.status === 'pending');
  const visiblePendingAccounts = pendingAccounts.filter(account => (
    account.email.includes(query)
      || account.account_name.toLowerCase().includes(query)
      || account.major.toLowerCase().includes(query)
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
      const major = document.createElement('td');
      const actionCell = document.createElement('td');
      const editButton = document.createElement('button');
      const approveButton = document.createElement('button');
      const deleteButton = document.createElement('button');

      email.className = 'account-email';
      email.textContent = account.email;
      accountName.textContent = account.account_name;
      major.textContent = account.major || '—';
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
      row.append(email, accountName, major, actionCell);
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

// đọc ds tk từ Supabase
async function loadAccounts() {
  setConnectionState('loading', 'Đang kết nối...');
  try {
    const session = await getSession();
    if (!session) throw new Error('Vui lòng đăng nhập moderator.');
    const query = new URLSearchParams({
      select: 'email,account_name,status,major',
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
      major: typeof account.major === 'string' ? account.major : '',
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

// check mật khẩu trước khi lưu
function validatePassword(password) {
  if (password.length < 9 || new TextEncoder().encode(password).length > 72) {
    return 'Mật khẩu cần dài trên 8 ký tự và tối đa 72 byte UTF-8.';
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
  if (error.message.includes('users_account_name_unique')) {
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
  if (!accountName || accountName.length > 60) {
    setFormMessage('Tên tài khoản phải có từ 1 đến 60 ký tự.', 'error');
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
    accountStatusInput.value = 'verified';
    setFormMessage('Đã tạo tài khoản. Mật khẩu được băm và lưu an toàn.', 'success');
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
  changePasswordDescription.textContent = 'Mật khẩu được băm an toàn và không thể xem lại sau khi lưu.';
  changePasswordButton.textContent = 'Lưu mật khẩu mới';
  changePasswordMessage.textContent = '';
  changePasswordPanel.hidden = false;
  changePasswordPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  changePasswordDescription.textContent = 'Nhập mật khẩu mới cho sinh viên. Mật khẩu sẽ được băm an toàn trước khi tài khoản được xác minh.';
  changePasswordButton.textContent = 'Duyệt & lưu mật khẩu';
  setChangePasswordMessage('');
  changePasswordPanel.hidden = false;
  changePasswordPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  editAccountPanel.hidden = false;
  editAccountPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  if (!accountName || accountName.length > 60) {
    setEditAccountMessage('Tên tài khoản phải có từ 1 đến 60 ký tự.', 'error');
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
    editAccountPanel.hidden = true;
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
    changePasswordPanel.hidden = true;
    passwordFormMode = 'reset';
    changePasswordTitle.textContent = 'Đặt mật khẩu mới';
    changePasswordDescription.textContent = 'Mật khẩu được băm an toàn và không thể xem lại sau khi lưu.';
    changePasswordButton.textContent = 'Lưu mật khẩu mới';
    setFormMessage(isApproving
      ? `Đã duyệt tài khoản ${email} và lưu mật khẩu mới an toàn.`
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
  toggle.textContent = 'Hiện';
  toggle.setAttribute('aria-pressed', 'false');
}

document.querySelectorAll('.password-visibility-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!input) return;
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    toggle.textContent = isVisible ? 'Hiện' : 'Ẩn';
    toggle.setAttribute('aria-pressed', String(!isVisible));
  });
});

// đăng nhập moderator
async function handleModeratorLogin(event) {
  event.preventDefault();
  signInButton.disabled = true;
  setAuthMessage('Đang đăng nhập...');
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
    setAuthMessage(`Đăng nhập thất bại: ${error.message}`, 'error');
  } finally {
    signInButton.disabled = false;
  }
}

searchInput.addEventListener('input', () => renderAccounts());
statusFilter.addEventListener('change', () => renderAccounts());
moderatorLoginForm.addEventListener('submit', handleModeratorLogin);
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
  editAccountPanel.hidden = true;
});
changePasswordForm.addEventListener('submit', handleChangePassword);
cancelChangePasswordButton.addEventListener('click', () => {
  changePasswordForm.reset();
  resetPasswordVisibility(changePasswordValue);
  changePasswordPanel.hidden = true;
  passwordFormMode = 'reset';
  changePasswordTitle.textContent = 'Đặt mật khẩu mới';
  changePasswordDescription.textContent = 'Mật khẩu được băm an toàn và không thể xem lại sau khi lưu.';
  changePasswordButton.textContent = 'Lưu mật khẩu mới';
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
  } catch (error) {
    console.error('Không thể khôi phục phiên moderator:', error);
    setConnectionState('error', 'Cần đăng nhập lại');
    showLogin(error.message, 'error');
  }
}

initializeModeratorPage();
