export {};
const form = document.querySelector("form")!,
  input = document.querySelector<HTMLInputElement>("#token")!,
  status = document.querySelector<HTMLElement>("#status")!;
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const auddToken = input.value.trim();
  void chrome.storage.local.set({ auddToken }).then(() => {
    input.value = "";
    status.textContent = auddToken
      ? "Token saved locally."
      : "Token removed.";
  });
});
