
const SUPABASE_URL = 'https://jopyswntrgtgbsezgwkn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcHlzd250cmd0Z2JzZXpnd2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTc2NDIsImV4cCI6MjEwNzYzMzY0Mn0.C0JTJwg_zgPqT7JCyPVqqR3-lKMb2EQHFOUpVGdZD1s';

window.SUPABASE_CONFIG = Object.freeze({
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY
});


// tìm hồ sơ; RPC kiểm tra mật khẩu đã mã hóa ở phía Supabase
async function lookupUser(email, password, accessToken = SUPABASE_ANON_KEY) {
  if (!accessToken) {
    throw new Error('Cần đăng nhập Supabase trước khi tra cứu.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lookup_user_by_email`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
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
  const passwordInput = document.getElementById('searchPasswordInput');
  const password = passwordInput.value;
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
    showMessage('Vui lòng nhập mật khẩu tài khoản.');
    passwordInput.focus();
    return;
  }
  ctaView.classList.add('hidden');
  infoView.classList.add('hidden');
  loadingView.classList.remove('hidden');
  searchButton.disabled = true;

  try {
    const user = await lookupUser(emailInput, password);
    if (!user) {
      showMessage('Email hoặc mật khẩu không đúng, hoặc không tìm thấy tài khoản.');
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
    searchButton.disabled = false;
  }
}

const searchPasswordToggle = document.getElementById('searchPasswordToggle');
if (searchPasswordToggle) {
  searchPasswordToggle.addEventListener('click', () => {
    const passwordInput = document.getElementById(
      searchPasswordToggle.getAttribute('aria-controls')
    );
    if (!passwordInput) return;

    const isVisible = passwordInput.type === 'password';
    passwordInput.type = isVisible ? 'text' : 'password';
    searchPasswordToggle.querySelector('img').src = isVisible
      ? 'images/eye-open.png'
      : 'images/eye-closed.png';
    searchPasswordToggle.setAttribute('aria-label', `${isVisible ? 'Ẩn' : 'Hiện'} mật khẩu`);
    searchPasswordToggle.setAttribute('aria-pressed', String(isVisible));
  });
}

        const bgOverlay = document.getElementById('bgOverlay');
        const navbar = document.getElementById('navbar');

        // cuộn trang thì đổi độ tối nền + thanh điều hướng
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const heroHeight = window.innerHeight;
            const fadeProgress = Math.min(scrollY / (heroHeight * 0.8), 1);
            const overlayOpacity = 0.4 + (fadeProgress * 0.6);
            
            if (bgOverlay) bgOverlay.style.opacity = overlayOpacity;
            if (navbar) {
                if (scrollY > 50) {
                    navbar.classList.add('bg-[#0f1115]/90', 'shadow-lg');
                    navbar.classList.remove('bg-black/20');
                } else {
                    navbar.classList.remove('bg-[#0f1115]/90', 'shadow-lg');
                    navbar.classList.add('bg-black/20');
                }
            }
        });

// mở ảnh lớn và tự chuyển ảnh
const sectionTwoCarousel = document.querySelector('.section-two-carousel');
if (sectionTwoCarousel) {
  const lightbox = document.querySelector('.image-lightbox');
  const lightboxImage = lightbox.querySelector('.image-lightbox-main');
  const lightboxChoices = [...lightbox.querySelectorAll('.image-lightbox-choice')];
  const slides = lightboxChoices.map((choice) => {
    const thumbnail = choice.querySelector('img');
    return {
      src: thumbnail.getAttribute('src'),
      alt: thumbnail.alt
    };
  });
  const transitionDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750;
  let currentImage = sectionTwoCarousel.querySelector('.section-two-image');
  let currentSlide = 0;

  if (slides.length > 0) {
    currentImage.src = slides[0].src;
    currentImage.alt = slides[0].alt;
  }

  const selectLightboxSlide = (slideIndex) => {
    lightboxImage.src = slides[slideIndex].src;
    lightboxImage.alt = slides[slideIndex].alt;
    lightboxChoices.forEach((choice, index) => {
      choice.setAttribute('aria-pressed', String(index === slideIndex));
    });
  };

  sectionTwoCarousel.addEventListener('click', (event) => {
    if (!event.target.closest('.section-two-image')) return;
    const displayedImage = event.target.closest('.section-two-image');
    const slideIndex = slides.findIndex((slide) => slide.src === displayedImage.getAttribute('src'));
    if (slideIndex < 0) return;
    selectLightboxSlide(slideIndex);
    lightbox.showModal();
  });

  lightbox.querySelector('.image-lightbox-close').addEventListener('click', () => {
    lightbox.close();
  });

  lightboxChoices.forEach((choice, index) => {
    choice.addEventListener('click', () => {
      selectLightboxSlide(index);
    });
  });

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) lightbox.close();
  });

  const showNextSlide = () => {
    const nextSlide = (currentSlide + 1) % slides.length;
    const nextImage = document.createElement('img');
    nextImage.className = 'section-two-image section-two-image-entering';
    nextImage.src = slides[nextSlide].src;
    nextImage.alt = slides[nextSlide].alt;
    sectionTwoCarousel.append(nextImage);

    requestAnimationFrame(() => {
      nextImage.classList.add('is-visible');
      currentImage.classList.add('is-exiting');

      window.setTimeout(() => {
        currentImage.remove();
        nextImage.classList.remove('section-two-image-entering', 'is-visible');
        currentImage = nextImage;
        currentSlide = nextSlide;
        window.setTimeout(showNextSlide, 5000);
      }, transitionDuration);
    });
  };

  window.setTimeout(showNextSlide, 5000);
}

// bấm câu hỏi để mở hoặc đóng câu trả lời
document.querySelectorAll('.faq-question').forEach((question) => {
  question.addEventListener('click', () => {
    const isExpanded = question.getAttribute('aria-expanded') === 'true';
    const answer = document.getElementById(question.getAttribute('aria-controls'));
    question.setAttribute('aria-expanded', String(!isExpanded));
    answer.setAttribute('aria-hidden', String(isExpanded));
    question.closest('.faq-item').classList.toggle('is-open', !isExpanded);
  });
});
 