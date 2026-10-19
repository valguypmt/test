const emailVerificationStep = document.getElementById('emailStep');
const accountStep = document.getElementById('accountStep');
const statusStep = document.getElementById('statusStep');
const studentEmail = document.getElementById('studentEmail');
const otpCode = document.getElementById('otpCode');
const sendCodeButton = document.getElementById('sendCode');
const formMessage = document.getElementById('formMessage');
const accountMessage = document.getElementById('accountMessage');
const statusMessage = document.getElementById('statusMessage');
const consent = document.getElementById('consent');
const studentPassword = document.getElementById('studentPW');
const studentPasswordToggle = document.getElementById('studentPasswordToggle');
const submittedPassword = document.getElementById('submittedPassword');
const submittedPasswordToggle = document.getElementById('submittedPasswordToggle');

let verifiedEmail = '';
let accessToken = '';
let refreshToken = '';
let countdownTimer;
let currentSubmittedPassword = '';
let isSubmittedPasswordVisible = false;

// bật/tắt hiện mật khẩu
function setStudentPasswordVisibility(isVisible) {
  studentPassword.type = isVisible ? 'text' : 'password';
  studentPasswordToggle.querySelector('img').src = isVisible
    ? 'images/eye-open.png'
    : 'images/eye-closed.png';
  studentPasswordToggle.setAttribute('aria-label', `${isVisible ? 'Ẩn' : 'Hiện'} mật khẩu`);
  studentPasswordToggle.setAttribute('aria-pressed', String(isVisible));
}

// hiện thông báo
function showMessage(element, message, state = 'error') {
  element.textContent = message;
  element.dataset.state = message ? state : '';
}

// đổi lỗi Supabase sang câu dễ hiểu
function friendlyRegistrationError(error, context) {
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  if (message.includes('for security purposes')) {
    const waitSeconds = message.match(/after\s+(\d+)\s+seconds?/);
    if (waitSeconds && Number(waitSeconds[1]) > 0) {
      return `Vì lý do bảo mật, bạn chỉ có thể yêu cầu gửi lại sau ${waitSeconds[1]} giây.`;
    }
    return 'Vì lý do bảo mật, hiện chưa thể gửi email xác minh. Vui lòng đợi một chút rồi thử lại.';
  }
  if (message.includes('token has expired') || message.includes('invalid token')) {
    return 'Mã OTP đã hết hạn hoặc không đúng. Hãy gửi mã mới nhất rồi nhập lại mã đó.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Bạn đã yêu cầu quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.';
  }
  if (
    message.includes('users_account_name_unique')
    || message.includes('users_account_name_key')
    || message.includes('account name already exists')
    || message.includes('minecraft account name already exists')
    || message.includes('duplicate key') && message.includes('account_name')
  ) {
    return 'Tên tài khoản này đã được sử dụng. Hãy chọn tên khác.';
  }
  if (
    message.includes('users_email_unique')
    || message.includes('users_pkey')
    || message.includes('email already exists')
    || message.includes('registration already exists')
    || message.includes('duplicate key') && message.includes('email')
  ) {
    return 'Email này đã có yêu cầu/tài khoản. Đang kiểm tra trạng thái đã lưu...';
  }
  if (message.includes('account name must be')) {
    return 'Tên tài khoản phải dài 3–16 ký tự, chỉ gồm chữ không dấu, số và dấu gạch dưới (_).';
  }
  if (context === 'send' && (error.status === 429 || message.includes('email rate limit'))) {
    return 'Supabase đang giới hạn gửi email. Chờ một lúc rồi yêu cầu mã/link mới.';
  }
  return `${context}: ${error.message}`;
}

// chuyển bước quản lý tk
function showStep(step) {
  emailVerificationStep.hidden = step !== 'email';
  accountStep.hidden = step !== 'account';
  statusStep.hidden = step !== 'status';
  showMessage(formMessage, '');
  showMessage(accountMessage, '');
  showMessage(statusMessage, '');
}

// check mail sinh viên
function getValidEmail() {
  const email = studentEmail.value.trim().toLowerCase();
  if (!/^[^\s@]+@student\.ctu\.edu\.vn$/.test(email)) {
    showMessage(formMessage, 'Vui lòng nhập email sinh viên hợp lệ có đuôi @student.ctu.edu.vn.');
    studentEmail.focus();
    return '';
  }
  return email;
}

// link quay lại sau khi bấm email
function getRegistrationRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

// gửi request lên Supabase
async function supabaseRequest(path, body, token = window.SUPABASE_CONFIG?.anonKey) {
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config.anonKey) {
    throw new Error('Thiếu cấu hình Supabase. Tải lại trang hoặc kiểm tra index.js.');
  }

  const response = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token || config.anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }

  if (!response.ok) {
    const message = result && typeof result === 'object'
      ? result.msg || result.message || result.error_description || result.error
      : result;
    const error = new Error(message || `Supabase trả về HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return result;
}

// lấy user theo access token
async function getAuthenticatedUser(token) {
  const config = window.SUPABASE_CONFIG;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `******`
    }
  });
  const user = await response.json();
  if (!response.ok) {
    throw new Error(user.message || user.msg || `Supabase trả về HTTP ${response.status}.`);
  }
  return user;
}

// xử lý khi quay về từ link email
async function handleEmailLinkCallback() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const errorDescription = fragment.get('error_description')
    || query.get('error_description')
    || fragment.get('error')
    || query.get('error');
  const token = fragment.get('access_token') || query.get('access_token');

  if (!errorDescription && !token) return;

  window.history.replaceState(
    {},
    document.title,
    `${window.location.origin}${window.location.pathname}`
  );

  if (errorDescription) {
    showMessage(formMessage, `Liên kết xác minh không dùng được: ${errorDescription}`);
    return;
  }

  refreshToken = fragment.get('refresh_token') || query.get('refresh_token') || '';
  try {
    const user = await getAuthenticatedUser(token);
    const email = String(user.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@student\.ctu\.edu\.vn$/.test(email)) {
      throw new Error('Email đã xác minh không thuộc miền @student.ctu.edu.vn.');
    }

    accessToken = token;
    verifiedEmail = email;
    studentEmail.value = email;
    otpCode.value = '';
    showStep('email');
    showMessage(
      formMessage,
      'Email đã được xác minh qua liên kết. Tích vào ô đồng ý rồi bấm “Xác minh & tiếp tục”.',
      'success'
    );
  } catch (error) {
    accessToken = '';
    refreshToken = '';
    console.error('Không thể xử lý liên kết xác minh Supabase:', error);
    showMessage(formMessage, `Không xử lý được liên kết xác minh: ${error.message}`);
  }
}

// request có thử làm mới phiên nếu hết hạn
async function authenticatedRequest(path, body) {
  try {
    return await supabaseRequest(path, body, accessToken);
  } catch (error) {
    if (error.status !== 401 || !refreshToken) throw error;

    const session = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
      refresh_token: refreshToken
    });
    accessToken = session.access_token;
    refreshToken = session.refresh_token || refreshToken;
    return supabaseRequest(path, body, accessToken);
  }
}

// đếm ngược trước khi gửi lại mail
function startSendCooldown() {
  window.clearInterval(countdownTimer);
  let secondsRemaining = 60;
  sendCodeButton.disabled = true;
  sendCodeButton.textContent = `Chờ (${secondsRemaining}s)`;
  countdownTimer = window.setInterval(() => {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      window.clearInterval(countdownTimer);
      sendCodeButton.disabled = false;
      sendCodeButton.textContent = 'Gửi lại';
      return;
    }
    sendCodeButton.textContent = `Chờ (${secondsRemaining}s)`;
  }, 1000);
}

// gửi mã xác minh
sendCodeButton.addEventListener('click', async () => {
  const email = getValidEmail();
  if (!email || sendCodeButton.disabled) return;

  sendCodeButton.disabled = true;
  sendCodeButton.textContent = 'Đang gửi...';
  showMessage(formMessage, 'Đang yêu cầu gửi mã xác minh...', 'info');

  try {
    const redirectTo = encodeURIComponent(getRegistrationRedirectUrl());
    await supabaseRequest(`/auth/v1/otp?redirect_to=${redirectTo}`, {
      email,
      create_user: true
    });
    verifiedEmail = email;
    otpCode.value = '';
    showMessage(formMessage, 'Đã gửi email xác minh. Kiểm tra hộp thư đến và thư mục Spam.', 'success');
    startSendCooldown();
    otpCode.focus();
  } catch (error) {
    console.error('Không thể gửi email xác minh Supabase:', error);
    showMessage(formMessage, friendlyRegistrationError(error, 'Không gửi được email xác minh'));
    sendCodeButton.disabled = false;
    sendCodeButton.textContent = 'Gửi email';
  }
});

// xác minh email rồi qua bước quản lý tk
emailVerificationStep.addEventListener('submit', async event => {
  event.preventDefault();

  const email = getValidEmail();
  if (!email) return;
  if (!verifiedEmail || email !== verifiedEmail) {
    showMessage(formMessage, 'Hãy gửi mã xác minh cho email này trước khi tiếp tục.');
    return;
  }
  if (!consent.checked) {
    showMessage(formMessage, 'Vui lòng xác nhận đồng ý sử dụng email để xác minh và xét duyệt yêu cầu tài khoản.');
    consent.focus();
    return;
  }
  if (!accessToken && !/^\d{8}$/.test(otpCode.value.trim())) {
    showMessage(formMessage, 'Nhập đủ mã OTP 8 chữ số trong email hoặc mở liên kết xác minh được gửi tới email.');
    otpCode.focus();
    return;
  }

  const submitButton = emailVerificationStep.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage(formMessage, accessToken ? 'Đang tiếp tục...' : 'Đang xác minh mã...', 'info');

  try {
    if (!accessToken) {
      const result = await supabaseRequest('/auth/v1/verify', {
        email,
        token: otpCode.value.trim(),
        type: 'email'
      });
      if (!result?.access_token) {
        throw new Error('Supabase không trả về phiên đăng nhập sau khi xác minh.');
      }

      accessToken = result.access_token;
      refreshToken = result.refresh_token || '';
    }

    document.getElementById('verifiedEmail').value = email;
    const existingRegistration = await loadRegistrationStatus();
    if (existingRegistration) {
      showExistingRegistration(existingRegistration);
      return;
    }

    showStep('account');
    document.getElementById('accountName').focus();
  } catch (error) {
    console.error('Không thể xác minh OTP Supabase:', error);
    showMessage(formMessage, friendlyRegistrationError(error, 'Không thể tiếp tục xác minh'));
    otpCode.focus();
  } finally {
    submitButton.disabled = false;
  }
});

// hiện trạng thái yêu cầu
function renderRegistrationStatus(registration) {
  const statusLabels = {
    pending: 'ĐANG CHỜ DUYỆT',
    verified: 'ĐÃ XÁC MINH',
    banned: 'ĐÃ VÔ HIỆU HÓA'
  };
  const status = String(registration.status || 'pending').toLowerCase();
  const badge = document.getElementById('registrationStatusBadge');
  badge.textContent = statusLabels[status] || status.toUpperCase();
  badge.dataset.status = status;
  document.getElementById('submittedAccount').textContent = registration.account_name;
  document.getElementById('submittedEmail').textContent = registration.email;
  const isBanned = status === 'banned';
  currentSubmittedPassword = isBanned ? '' : String(registration.password || '').trim();
  isSubmittedPasswordVisible = false;
  submittedPassword.textContent = currentSubmittedPassword ? '********' : '';
  submittedPasswordToggle.querySelector('img').src = 'images/eye-closed.png';
  submittedPasswordToggle.setAttribute('aria-label', 'Hiện mật khẩu tài khoản');
  submittedPasswordToggle.setAttribute('aria-pressed', 'false');
  submittedPasswordToggle.hidden = isBanned || !currentSubmittedPassword;
  document.getElementById('submittedPasswordRow').hidden = isBanned || !currentSubmittedPassword;

  const descriptions = {
    pending: 'Yêu cầu đã được gửi đến quản trị viên và sẽ được xét duyệt thủ công. Quá trình này có thể mất vài ngày tùy theo số lượng yêu cầu đang chờ; tài khoản sẽ được kích hoạt sau khi hoàn tất xét duyệt.',
    verified: 'Tài khoản đã được quản trị viên xác minh.',
    banned: 'Tài khoản hiện không hoạt động. Vui lòng liên hệ quản trị viên.'
  };
  document.querySelector('.status-copy').textContent = descriptions[status]
    || 'Trạng thái tài khoản đã được cập nhật.';
}

// đọc trạng thái đã lưu
async function loadRegistrationStatus() {
  const result = await authenticatedRequest(
    '/rest/v1/rpc/get_my_registration_status',
    {}
  );
  const registration = Array.isArray(result) ? result[0] : result;
  if (registration) {
    renderRegistrationStatus(registration);
  }
  return registration || null;
}

// hiện yêu cầu đã có sẵn
function showExistingRegistration(registration) {
  renderRegistrationStatus(registration);
  showStep('status');
}

// gửi yêu cầu thay đổi tk
accountStep.addEventListener('submit', async event => {
  event.preventDefault();

  const accountName = document.getElementById('accountName').value.trim();
  const password = studentPassword.value;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(accountName)) {
    showMessage(accountMessage, 'Tên tài khoản phải dài 3–16 ký tự, chỉ gồm chữ không dấu, số và dấu gạch dưới (_), không có dấu cách.');
    document.getElementById('accountName').focus();
    return;
  }
  if (!/^[\x21-\x7E]{6,20}$/.test(password)) {
    showMessage(accountMessage, 'Mật khẩu phải dài từ 6 đến 20 ký tự, không có dấu cách hoặc dấu tiếng Việt.');
    studentPassword.focus();
    return;
  }
  if (!accessToken) {
    showMessage(accountMessage, 'Phiên xác minh đã hết. Hãy xác minh email lại.');
    return;
  }

  const submitButton = accountStep.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage(accountMessage, 'Đang gửi yêu cầu tài khoản...', 'info');

  try {
    await authenticatedRequest(
      '/rest/v1/rpc/submit_registration_request',
      { p_account_name: accountName, p_password: password }
    );
    const registration = await loadRegistrationStatus();
    if (!registration) {
      throw new Error('Yêu cầu đã gửi nhưng chưa tìm thấy trạng thái lưu. Hãy làm mới trạng thái hoặc liên hệ quản trị viên.');
    }
    showStep('status');
  } catch (error) {
    console.error('Không thể gửi yêu cầu tài khoản:', error);
    if (friendlyRegistrationError(error, '').startsWith('Email này đã có')) {
      try {
        const existingRegistration = await loadRegistrationStatus();
        if (existingRegistration) {
          showExistingRegistration(existingRegistration);
          return;
        }
      } catch (statusError) {
        console.error('Không thể kiểm tra trạng thái email đã lưu:', statusError);
      }
    }
    showMessage(accountMessage, friendlyRegistrationError(error, 'Không gửi được yêu cầu tài khoản'));
  } finally {
    submitButton.disabled = false;
  }
});

// tải lại trạng thái tk
document.getElementById('refreshStatus').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  showMessage(statusMessage, 'Đang tải trạng thái...', 'info');
  try {
    await loadRegistrationStatus();
    showMessage(statusMessage, 'Trạng thái đã được cập nhật.', 'success');
  } catch (error) {
    console.error('Không thể tải trạng thái tài khoản:', error);
    showMessage(statusMessage, friendlyRegistrationError(error, 'Không tải được trạng thái'));
  } finally {
    button.disabled = false;
  }
});

// chỉ nhận số, tối đa 8 số
otpCode.addEventListener('input', () => {
  otpCode.value = otpCode.value.replace(/\D/g, '').slice(0, 8);
});

// bật/tắt hiện mật khẩu đang nhập
studentPasswordToggle.addEventListener('click', () => {
  setStudentPasswordVisibility(studentPassword.type === 'password');
});

// bật/tắt hiện mật khẩu đã lưu
submittedPasswordToggle.addEventListener('click', () => {
  isSubmittedPasswordVisible = !isSubmittedPasswordVisible;
  submittedPassword.textContent = isSubmittedPasswordVisible
    ? currentSubmittedPassword
    : '********';
  submittedPasswordToggle.querySelector('img').src = isSubmittedPasswordVisible
    ? 'images/eye-open.png'
    : 'images/eye-closed.png';
  submittedPasswordToggle.setAttribute(
    'aria-label',
    `${isSubmittedPasswordVisible ? 'Ẩn' : 'Hiện'} mật khẩu tài khoản`
  );
  submittedPasswordToggle.setAttribute('aria-pressed', String(isSubmittedPasswordVisible));
});

// xử lý link xác minh nếu có
void handleEmailLinkCallback();
