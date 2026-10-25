const emailVerificationStep = document.getElementById('emailStep');
const accountStep = document.getElementById('accountStep');
const statusStep = document.getElementById('statusStep');
const feedbackStep = document.getElementById('feedbackStep');
const feedbackForm = document.getElementById('feedbackForm');
const feedbackSubject = document.getElementById('feedbackSubject');
const feedbackMessageInput = document.getElementById('feedbackMessageInput');
const feedbackCharacterCount = document.getElementById('feedbackCharacterCount');
const feedbackFormMessage = document.getElementById('feedbackFormMessage');
const feedbackHistory = document.getElementById('feedbackHistory');
const deleteMyFeedbackDialog = document.getElementById('deleteMyFeedbackDialog');
const deleteMyFeedbackTitle = document.getElementById('deleteMyFeedbackTitle');
const deleteMyFeedbackDescription = document.getElementById('deleteMyFeedbackDescription');
const sendFeedbackButton = document.getElementById('sendFeedbackButton');
const studentEmail = document.getElementById('studentEmail');
const otpCode = document.getElementById('otpCode');
const sendCodeButton = document.getElementById('sendCode');
const formMessage = document.getElementById('formMessage');
const accountMessage = document.getElementById('accountMessage');
const consent = document.getElementById('consent');
const studentPassword = document.getElementById('studentPW');
const studentPasswordToggle = document.getElementById('studentPasswordToggle');
const submittedPassword = document.getElementById('submittedPassword');
const submittedPasswordToggle = document.getElementById('submittedPasswordToggle');

let verifiedEmail = '';
let accessToken = '';
let refreshToken = '';
let countdownTimer;
let feedbackRefreshTimer;
let feedbackRefreshInFlight = false;
let feedbackDeleteInFlight = false;
let feedbackHistoryVersion = 0;
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
  feedbackStep.hidden = step !== 'feedback';
  showMessage(formMessage, '');
  showMessage(accountMessage, '');
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

const feedbackStatusLabels = {
  submitted: 'Đã gửi',
  new: 'Đã gửi',
  in_progress: 'Đang xem xét',
  resolved: 'Đã hoàn tất',
  cancelled: 'Đã hủy'
};

function renderFeedbackHistory(feedbackItems) {
  feedbackHistory.replaceChildren();
  if (feedbackItems.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'feedback-empty';
    emptyMessage.textContent = 'Bạn chưa gửi phản hồi nào.';
    feedbackHistory.append(emptyMessage);
    return;
  }

  for (const item of feedbackItems) {
    const card = document.createElement('article');
    card.className = 'feedback-history-card';
    const heading = document.createElement('div');
    heading.className = 'feedback-history-card-heading';
    const subject = document.createElement('h3');
    subject.textContent = item.subject;
    const status = document.createElement('span');
    status.className = `feedback-status-badge feedback-status-${item.status}`;
    status.textContent = feedbackStatusLabels[item.status] || item.status;
    heading.append(subject, status);

    const message = document.createElement('p');
    message.className = 'feedback-history-message';
    message.textContent = item.message;
    const createdAt = document.createElement('time');
    createdAt.className = 'feedback-history-date';
    createdAt.dateTime = item.created_at;
    createdAt.textContent = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(item.created_at));
    const footer = document.createElement('div');
    footer.className = 'feedback-history-card-footer';
    footer.append(createdAt);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'feedback-delete-button';
    deleteButton.dataset.feedbackId = item.id;
    if (item.status === 'resolved') {
      deleteButton.classList.add('is-completed');
      deleteButton.textContent = 'Xóa phản hồi đã hoàn tất (khuyến nghị)';
      deleteButton.setAttribute('aria-label', `Xóa phản hồi đã hoàn tất: ${item.subject}`);
    } else if (item.status === 'cancelled') {
      deleteButton.classList.add('is-cancelled');
      deleteButton.textContent = 'Xóa phản hồi đã bị hủy (khuyến nghị)';
      deleteButton.setAttribute('aria-label', `Xóa phản hồi đã bị hủy: ${item.subject}`);
    } else {
      deleteButton.textContent = 'Xóa';
      deleteButton.setAttribute('aria-label', `Xóa phản hồi: ${item.subject}`);
    }
    footer.append(deleteButton);
    card.append(heading, message);

    if (item.moderator_reply) {
      const reply = document.createElement('div');
      reply.className = 'feedback-moderator-reply';
      const replyHeading = document.createElement('strong');
      replyHeading.textContent = item.moderator_reply_by
        ? `Phản hồi từ ${item.moderator_reply_by}`
        : 'Phản hồi từ quản trị viên';
      const replyText = document.createElement('p');
      replyText.textContent = item.moderator_reply;
      reply.append(replyHeading, replyText);
      card.append(reply);
    }
    card.append(footer);
    feedbackHistory.append(card);
  }
}

async function loadMyFeedback() {
  const version = feedbackHistoryVersion;
  const result = await authenticatedRequest('/rest/v1/rpc/list_my_feedback', {});
  if (!Array.isArray(result)) {
    throw new Error('Danh sách phản hồi từ Supabase không đúng định dạng.');
  }
  if (version === feedbackHistoryVersion) {
    renderFeedbackHistory(result);
  }
}

async function refreshFeedbackHistory() {
  if (feedbackRefreshInFlight || feedbackDeleteInFlight || feedbackStep.hidden) return false;
  feedbackRefreshInFlight = true;
  try {
    await loadMyFeedback();
    return true;
  } catch (error) {
    console.error('Không thể cập nhật lịch sử phản hồi:', error);
    showMessage(
      feedbackFormMessage,
      `Không thể cập nhật phản hồi: ${feedbackActionErrorMessage(error)}`
    );
    return false;
  } finally {
    feedbackRefreshInFlight = false;
  }
}

function startFeedbackRefresh() {
  window.clearInterval(feedbackRefreshTimer);
  feedbackRefreshTimer = window.setInterval(() => {
    if (!document.hidden) void refreshFeedbackHistory();
  }, 5000);
}

function confirmFeedbackDeletion(item, status) {
  const isCompleted = status === 'resolved';
  const isCancelled = status === 'cancelled';
  deleteMyFeedbackDialog.classList.toggle('is-completed', isCompleted);
  deleteMyFeedbackDialog.classList.toggle('is-cancelled', isCancelled);
  deleteMyFeedbackTitle.textContent = isCompleted || isCancelled
    ? 'Dọn phản hồi này?'
    : 'Xóa phản hồi này?';
  deleteMyFeedbackDescription.textContent = isCompleted
    ? `“${item.subject}” đã hoàn tất. Bạn có thể xóa phản hồi này để dọn dữ liệu không còn cần thiết. Thao tác này không thể hoàn tác.`
    : isCancelled
      ? `“${item.subject}” đã bị hủy. Bạn có thể xóa phản hồi này để dọn dữ liệu không còn cần thiết. Thao tác này không thể hoàn tác.`
      : `Bạn sắp xóa phản hồi “${item.subject}”. Thao tác này không thể hoàn tác.`;
  deleteMyFeedbackDialog.returnValue = '';

  return new Promise(resolve => {
    deleteMyFeedbackDialog.addEventListener('close', () => {
      resolve(deleteMyFeedbackDialog.returnValue === 'delete');
    }, { once: true });
    deleteMyFeedbackDialog.showModal();
  });
}

function feedbackActionErrorMessage(error) {
  const message = String(error?.message || error);
  const normalized = message.toLowerCase();
  if (normalized.includes('feedback item not found')) {
    return 'Phản hồi này không còn tồn tại. Có thể bạn hoặc quản trị viên đã xóa phản hồi; danh sách sẽ được làm mới.';
  }
  if (normalized.includes('could not find the function')
    || normalized.includes('function') && normalized.includes('schema cache')) {
    return 'Supabase chưa nhận diện chức năng này. Hãy chạy lại feedback-system.sql trong SQL Editor rồi tải lại trang.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'Không thể kết nối tới máy chủ. Kiểm tra kết nối mạng rồi thử lại.';
  }
  if (normalized.includes('moderator reply cannot exceed 200 characters')) {
    return 'Phản hồi của quản trị viên vượt quá giới hạn 200 ký tự.';
  }
  if (error?.status === 400) {
    return 'Yêu cầu không hợp lệ hoặc phản hồi đã thay đổi. Hãy tải lại trang rồi thử lại.';
  }
  if (error?.status >= 500) {
    return 'Máy chủ đang gặp sự cố khi xử lý phản hồi. Vui lòng thử lại sau.';
  }
  return 'Không thể xử lý phản hồi lúc này. Vui lòng thử lại; nếu lỗi tiếp diễn, hãy liên hệ quản trị viên.';
}

feedbackHistory.addEventListener('click', async event => {
  const button = event.target instanceof Element
    ? event.target.closest('.feedback-delete-button')
    : null;
  if (!button || feedbackDeleteInFlight) return;

  const feedbackId = button.dataset.feedbackId;
  const card = button.closest('.feedback-history-card');
  if (!feedbackId) {
    showMessage(feedbackFormMessage, 'Không xác định được phản hồi cần xóa.');
    return;
  }
  const item = { subject: card?.querySelector('h3')?.textContent || 'phản hồi này' };
  const status = button.classList.contains('is-completed')
    ? 'resolved'
    : button.classList.contains('is-cancelled')
      ? 'cancelled'
      : '';
  if (!(await confirmFeedbackDeletion(item, status))) return;

  feedbackDeleteInFlight = true;
  feedbackHistoryVersion += 1;
  button.disabled = true;
  showMessage(feedbackFormMessage, 'Đang xóa phản hồi...', 'info');
  let deleted = false;
  try {
    await authenticatedRequest('/rest/v1/rpc/delete_my_feedback', {
      p_feedback_id: feedbackId
    });
    deleted = true;
    button.closest('.feedback-history-card')?.remove();
    await loadMyFeedback();
    showMessage(feedbackFormMessage, 'Đã xóa phản hồi.', 'success');
  } catch (error) {
    console.error(deleted ? 'Đã xóa phản hồi nhưng không thể tải lại lịch sử:' : 'Không thể xóa phản hồi:', error);
    const isMissing = String(error?.message || error).toLowerCase().includes('feedback item not found');
    if (isMissing) {
      card?.remove();
      let refreshErrorMessage = '';
      try {
        await loadMyFeedback();
      } catch (refreshError) {
        console.error('Không thể làm mới lịch sử phản hồi:', refreshError);
        refreshErrorMessage = ' Không thể tải lại lịch sử; vui lòng thử làm mới trang.';
      }
      showMessage(
        feedbackFormMessage,
        `Phản hồi này không còn tồn tại. Có thể bạn hoặc quản trị viên đã xóa phản hồi.${refreshErrorMessage}`,
        refreshErrorMessage ? 'error' : 'info'
      );
      if (!deleted) button.disabled = false;
      return;
    }
    showMessage(
      feedbackFormMessage,
      deleted
        ? `Đã xóa phản hồi nhưng không thể tải lại lịch sử: ${feedbackActionErrorMessage(error)}`
        : `Không thể xóa phản hồi: ${feedbackActionErrorMessage(error)}`
    );
    if (!deleted) button.disabled = false;
  } finally {
    feedbackDeleteInFlight = false;
  }
});

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

document.getElementById('openFeedbackButton').addEventListener('click', async () => {
  showStep('feedback');
  feedbackHistory.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'feedback-empty';
  loading.textContent = 'Đang tải phản hồi...';
  feedbackHistory.append(loading);
  await refreshFeedbackHistory();
  startFeedbackRefresh();
});

document.getElementById('backToStatusButton').addEventListener('click', () => {
  window.clearInterval(feedbackRefreshTimer);
  showStep('status');
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !feedbackStep.hidden) {
    void refreshFeedbackHistory();
  }
});

document.querySelectorAll('.feedback-preset').forEach(button => {
  button.addEventListener('click', () => {
    feedbackSubject.value = button.dataset.subject;
    feedbackMessageInput.value = button.dataset.template;
    feedbackCharacterCount.textContent = `${feedbackMessageInput.value.length}/200`;
    document.querySelectorAll('.feedback-preset').forEach(preset => {
      const isSelected = preset === button;
      preset.setAttribute('aria-pressed', String(isSelected));
      preset.classList.toggle('is-selected', isSelected);
    });
    feedbackMessageInput.focus();
  });
});

feedbackMessageInput.addEventListener('input', () => {
  feedbackCharacterCount.textContent = `${feedbackMessageInput.value.length}/200`;
});

feedbackForm.addEventListener('submit', async event => {
  event.preventDefault();
  const subject = feedbackSubject.options[feedbackSubject.selectedIndex].text;
  const message = feedbackMessageInput.value.trim();
  if (!message) {
    showMessage(feedbackFormMessage, 'Vui lòng nhập nội dung phản hồi.');
    feedbackMessageInput.focus();
    return;
  }
  if (message.length > 200) {
    showMessage(feedbackFormMessage, 'Nội dung phản hồi không được vượt quá 200 ký tự.');
    return;
  }

  sendFeedbackButton.disabled = true;
  showMessage(feedbackFormMessage, 'Đang gửi phản hồi...', 'info');
  try {
    await authenticatedRequest('/rest/v1/rpc/submit_my_feedback', {
      p_subject: subject,
      p_message: message
    });
    feedbackForm.reset();
    document.querySelectorAll('.feedback-preset').forEach(preset => {
      preset.setAttribute('aria-pressed', 'false');
      preset.classList.remove('is-selected');
    });
    await loadMyFeedback();
    feedbackCharacterCount.textContent = '0/200';
    showMessage(feedbackFormMessage, 'Đã gửi phản hồi. Bạn có thể theo dõi cập nhật tại đây.', 'success');
  } catch (error) {
    console.error('Không thể gửi phản hồi:', error);
    showMessage(feedbackFormMessage, `Không thể gửi phản hồi: ${error.message}`);
  } finally {
    sendFeedbackButton.disabled = false;
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
