const SUPABASE_URL = 'https://jopyswntrgtgbsezgwkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcHlzd250cmd0Z2JzZXpnd2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTc2NDIsImV4cCI6MjEwNzYzMzY0Mn0.C0JTJwg_zgPqT7JCyPVqqR3-lKMb2EQHFOUpVGdZD1s';

// tìm user trong Supabase
async function lookupUser(email, password) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lookup_user_with_password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_email: email, p_password: password })
  });

  // đọc kết quả trả về
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }

  // lỗi từ Supabase
  if (!response.ok) {
    const message = result && typeof result === 'object'
      ? result.message || result.details || result.hint
      : result;
    throw new Error(message || `Supabase trả về HTTP ${response.status}.`);
  }

  // check format
  if (!Array.isArray(result)) {
    throw new Error('Dữ liệu tra cứu từ Supabase không đúng định dạng.');
  }
  return result[0] || null;
}

// tra cứu tài khoản
async function handleSearch() {
  const emailInput = document.getElementById('searchEmailInput').value.trim().toLowerCase();
  const password = document.getElementById('searchPasswordInput').value;
  const loadingView = document.getElementById('loadingView');
  const infoView = document.getElementById('infoView');
  const searchButton = document.querySelector('.lookup-btn-search');
  // ẩn kq cũ, bật loading
  infoView.classList.add('hidden');
  loadingView.classList.remove('hidden');
  searchButton.disabled = true;

  try {
    // tìm user
    const user = await lookupUser(emailInput, password);
    if (!user) return;

    // hiện info
    document.getElementById('resEmail').textContent = user.email;
    document.getElementById('resAccountName').textContent = user.account_name;
    const statusLabels = {
      verified: 'Verified',
      pending: 'Pending',
      banned: 'Banned'
    };
    const status = String(user.status || 'unknown').toLowerCase();
    const tag = document.getElementById('resStatusTag');
    tag.textContent = statusLabels[status] || status.toUpperCase();
    infoView.classList.remove('hidden');
  } catch (error) {
    // báo lỗi
    console.error('Lỗi tra cứu Supabase:', error);
  } finally {
    // dọn form
    loadingView.classList.add('hidden');
    document.getElementById('searchPasswordInput').value = '';
    searchButton.disabled = false;
  }
}
