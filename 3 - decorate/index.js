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
      ? result.message || result.details || result.hint
      : result;
    throw new Error(message || `Supabase trả về HTTP ${response.status}.`);
  }

  if (!Array.isArray(result)) {
    throw new Error('Dữ liệu tra cứu từ Supabase không đúng định dạng.');
  }
  return result[0] || null;
}

// kiểm tra thông tin rồi hiện kết quả
async function handleSearch() {
  const emailInput = document.getElementById('searchEmailInput').value.trim().toLowerCase();
  const password = document.getElementById('searchPasswordInput').value;
  const ctaView = document.getElementById('ctaView');
  const loadingView = document.getElementById('loadingView');
  const infoView = document.getElementById('infoView');
  const ctaMsg = document.getElementById('ctaMsg');
  const searchButton = document.querySelector('.lookup-btn-search');

  const showMessage = (message, isError = true) => {
    ctaMsg.textContent = message;
    ctaMsg.style.color = isError ? '#ef4444' : '';
    ctaView.classList.remove('hidden');
    loadingView.classList.add('hidden');
    infoView.classList.add('hidden');
  };

  if (!emailInput) {
    showMessage('Vui lòng nhập email sinh viên!');
    return;
  }
  if (!/^[^\s@]+@student\.ctu\.edu\.vn$/.test(emailInput)) {
    showMessage('Vui lòng nhập email có đuôi @student.ctu.edu.vn hợp lệ!');
    return;
  }
  if (!password) {
    showMessage('Vui lòng nhập mật khẩu tài khoản!');
    return;
  }

  ctaView.classList.add('hidden');
  infoView.classList.add('hidden');
  loadingView.classList.remove('hidden');
  searchButton.disabled = true;

  try {
    const user = await lookupUser(emailInput, password);
    if (!user) {
      showMessage('Email hoặc mật khẩu không chính xác!');
      return;
    }

    document.getElementById('resEmail').textContent = user.email;
    document.getElementById('resAccountName').textContent = user.account_name;
    const statusLabels = {
      verified: 'Đã xác minh',
      pending: 'Đang chờ',
      banned: 'Bị cấm sử dụng'
    };
    const status = String(user.status || 'unknown').toLowerCase();
    const tag = document.getElementById('resStatusTag');
    tag.textContent = statusLabels[status] || status.toUpperCase();
    tag.className = `status-tag status-${Object.hasOwn(statusLabels, status) ? status : 'unknown'}`;
    ctaMsg.style.color = '';
    infoView.classList.remove('hidden');
  } catch (error) {
    console.error('Lỗi tra cứu Supabase:', error);
    showMessage(`Không thể tra cứu dữ liệu: ${error.message}`);
  } finally {
    loadingView.classList.add('hidden');
    document.getElementById('searchPasswordInput').value = '';
    searchButton.disabled = false;
  }
}
// kéo trang thì đổi độ tối nền
        const bgOverlay = document.getElementById('bgOverlay');
        const navbar = document.getElementById('navbar');

        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const heroHeight = window.innerHeight;
            
            // cuộn càng xa thì nền càng tối
            const fadeProgress = Math.min(scrollY / (heroHeight * 0.8), 1);
            const overlayOpacity = 0.4 + (fadeProgress * 0.6);
            
            bgOverlay.style.opacity = overlayOpacity;

            // cập nhật thanh điều hướng
            if (scrollY > 50) {
                navbar.classList.add('bg-[#0f1115]/90', 'shadow-lg');
                navbar.classList.remove('bg-black/20');
            } else {
                navbar.classList.remove('bg-[#0f1115]/90', 'shadow-lg');
                navbar.classList.add('bg-black/20');
            }
        });
