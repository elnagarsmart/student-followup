(() => {
  "use strict";
  let installPrompt = null;
  const toast = (message) => {
    let area = document.getElementById("toast-area");
    if (!area) {
      area = document.createElement("div");
      area.id = "toast-area";
      area.className = "toast-area";
      area.setAttribute("role", "status");
      document.body.appendChild(area);
    }
    const item = document.createElement("p");
    item.className = "notice";
    item.textContent = message;
    area.prepend(item);
    window.setTimeout(() => item.remove(), 6500);
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    const button = document.getElementById("install-app");
    if (button) {
      button.textContent = "＋ تثبيت التطبيق";
      button.classList.add("install-ready");
    }
  });

  const installButton = document.getElementById("install-app");
  if (installButton) installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      const ua = navigator.userAgent || "";
      const message = /iPhone|iPad|iPod/i.test(ua)
        ? "على iPhone أو iPad: افتح الرابط في Safari، اضغط مشاركة، ثم «إضافة إلى الشاشة الرئيسية» وفعّل «فتح كتطبيق»."
        : /Android/i.test(ua)
          ? "على Android: افتح الرابط في Chrome، ثم قائمة ⋮ واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
          : "على الكمبيوتر: في Chrome أو Edge افتح القائمة واختر «تثبيت التطبيق» أو «Apps → Install this site as an app».";
      toast(message);
      return;
    }
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    installPrompt = null;
    if (result && result.outcome === "accepted") toast("تم قبول طلب تثبيت أكاديميا.");
  });

  window.addEventListener("appinstalled", () => toast("تم تثبيت مركز تحكم أكاديميا على الجهاز."));

  const downloadButton = document.getElementById("download-summary");
  if (downloadButton) downloadButton.addEventListener("click", () => {
    const get = (id) => document.getElementById(id)?.textContent?.trim() || "0";
    const rows = [
      ["المؤشر", "العدد"],
      ["المدرسون / الأكاديميات", get("teachers")],
      ["الطلاب", get("students")],
      ["أولياء الأمور", get("guardians")],
      ["المشرفون", get("supervisors")],
      ["تاريخ التقرير", new Date().toLocaleString("ar-EG")]
    ];
    if (rows.slice(1, 5).some((row) => row[1] === "—")) {
      toast("سجّل الدخول وانتظر تحميل الإحصائيات أولًا.");
      return;
    }
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "academia-platform-summary.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("تم تنزيل التقرير الإحصائي. لا يتضمن كلمات مرور أو بيانات اتصال شخصية.");
  });
})();