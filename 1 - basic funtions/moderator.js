// html
const tableBody = document.getElementById('usersTableBody');  // tài khoản
const searchInput = document.getElementById('searchInput');  // tìm kiếm 
const addAccountForm = document.getElementById('addAccountForm');  // thêm tài khoản
const downloadUsersButton = document.getElementById('downloadUsersButton'); // tải users
const accountStatusInput = document.getElementById('accountStatus'); // trạng thái

// ds tk
let accounts = [];
// có đổi chưa
let hasPendingChanges = false;

// lọc + vẽ
function renderAccounts() {

  // chữ tìm
  const query = searchInput.value.trim().toLowerCase();
  // mail/tên
  const visibleAccounts = accounts.filter(account =>
    account.email.includes(query) || account.accountName.toLowerCase().includes(query)
  );

  // xóa bảng cũ
  tableBody.replaceChildren();
  for (const account of visibleAccounts) {
    const row = document.createElement('tr');
    // 3 cột
    for (const value of [account.email, account.accountName, account.status]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    tableBody.append(row);
  }
}

// thêm/sửa tk
function handleAddAccount(event) {
  event.preventDefault();  // ko reload

  // lấy info
  const email = document.getElementById('accountEmail').value.trim().toLowerCase();
  const accountName = document.getElementById('accountName').value.trim();
  // thiếu thì thôi
  if (!email || !accountName) return;

  // tạo tk
  const account = { email, accountName, status: accountStatusInput.value };
  // mail trùng?
  const existingIndex = accounts.findIndex(item => item.email === email);
  if (existingIndex >= 0) accounts[existingIndex] = account;
  else accounts.push(account);

  // có đổi, bật tải
  hasPendingChanges = true;
  downloadUsersButton.hidden = false;
  // vẽ lại + dọn form
  renderAccounts();
  addAccountForm.reset();
  accountStatusInput.value = 'verified';
}

// đọc users
async function loadAccounts() {
  try {
    const response = await fetch('users.json');
    // lỗi thì catch
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // json -> js
    const data = await response.json();
    // check format
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid accounts data');
    }

    // lấy ds tk
    accounts = Object.values(data)
      .filter(account => account && typeof account.email === 'string')
      .map(account => ({
        email: account.email.trim().toLowerCase(),
        // thiếu thì trống
        accountName: typeof account.accountName === 'string' ? account.accountName : '',
        status: typeof account.status === 'string' ? account.status.toLowerCase() : ''
      }));
    // hiện ds
    renderAccounts();
  } catch (error) {
    // lỗi tải file
    console.error('Could not load accounts:', error);
  }
}

// tải json mới
function downloadUsersFile() {
  // chưa đổi thì thôi
  if (!hasPendingChanges) return;

  // mail làm key
  const database = Object.fromEntries(accounts.map(account => [account.email, account]));
  // tạo file
  const file = new Blob([JSON.stringify(database, null, 2)], { type: 'application/json' });
  // link tạm
  const downloadUrl = URL.createObjectURL(file);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'users.json';
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  // dọn link, ko xài nửa
  URL.revokeObjectURL(downloadUrl);

  // xong r
  hasPendingChanges = false;
  downloadUsersButton.hidden = true;
}

// gõ là lọc
searchInput.addEventListener('input', renderAccounts);
// submit form
addAccountForm.addEventListener('submit', handleAddAccount);
// tải file
downloadUsersButton.addEventListener('click', downloadUsersFile);
// mở trang: đọc ds
loadAccounts();
