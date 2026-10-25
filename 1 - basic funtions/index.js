const searchForm = document.getElementById('searchForm');  // form
const emailInput = document.getElementById('searchEmailInput');  // mail
const infoView = document.getElementById('infoView');  // kq

// tìm mail
async function handleSearch(event) {
  event.preventDefault();  // ko reload
  infoView.classList.add('hidden');  // ẩn kq cũ

  const email = emailInput.value.trim().toLowerCase();
  
  // ko có mail => blank
  if (!email) return;

  try {

    // đọc users
    const response = await fetch('users.json');

    // lỗi
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // json -> js
    const users = await response.json();

    // tìm mail
    const account = users[email];

    // ko thấy => blank
    if (!account) return;


    // hiện kq
    document.getElementById('resEmail').textContent = account.email;
    document.getElementById('resAccountName').textContent = account.accountName;
    document.getElementById('resStatusTag').textContent = account.status;

    // show kq
    infoView.classList.remove('hidden');
  } catch (error) {
    // báo lỗi
    console.error('Could not load accounts:', error);
  }
}

searchForm.addEventListener('submit', handleSearch);
