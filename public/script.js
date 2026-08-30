document.addEventListener('DOMContentLoaded', () => {
  const getKeyBtn = document.getElementById('getKeyBtn');
  const btnText = getKeyBtn.querySelector('.btn-text');
  const spinner = getKeyBtn.querySelector('.spinner');
  const resultBox = document.getElementById('resultBox');
  const keyInput = document.getElementById('keyInput');
  const copyBtn = document.getElementById('copyBtn');
  const toast = document.getElementById('toast');

  getKeyBtn.addEventListener('click', async () => {
    // UI state loading
    getKeyBtn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
      const response = await fetch('/api/getkey');
      const data = await response.json();

      if (data.success) {
        keyInput.value = data.key;
        resultBox.classList.remove('hidden');
      } else {
        showToast(data.message || 'Gagal mengambil key');
      }
    } catch (error) {
      showToast('Terjadi kesalahan koneksi server');
    } finally {
      // Restore UI state
      getKeyBtn.disabled = false;
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  copyBtn.addEventListener('click', () => {
    if (!keyInput.value) return;

    keyInput.select();
    keyInput.setSelectionRange(0, 99999);

    try {
      document.execCommand('copy');
      showToast('Key berhasil disalin ke clipboard!');
    } catch (err) {
      showToast('Gagal menyalin key');
    }
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
});
