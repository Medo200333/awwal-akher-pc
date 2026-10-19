const steps: { title: string; body: string }[] = [
  {
    title: "صدّر الأشخاص والتمبلت",
    body: "من التيم: Person ثم Export Person Information. حط باسورد على ملف الـ ZIP. علّم Access Level Information و Schedule Information. الملف ده فيه الناس والصلاحيات والجداول، وهو اللي يترجّع بعدين من Import.",
  },
  {
    title: "صدّر كشف الأجهزة",
    body: "Device and Maintenance ثم Resource Management. اختار نوع الجهاز، وبعدين Export. هينزل إكسل فيه اسم كل جهاز وسيرياله. ده كشف، مش ملف إعدادات. سيبه معاك عشان تضيف الأجهزة تاني.",
  },
  {
    title: "باك أب كل جهاز بباسورد",
    body: "لكل جهاز لوحده من الويب: Maintenance and Security ثم Maintenance ثم Backup and Reset. اضغط Export تحت Device Parameters، و Export تحت Data Migration عشان المستخدمين والكارتات. حط باسورد. ومن شاشة الجهاز، حط فلاشة واختار Data ثم Export Data: User Data و Face Data و Event Data و Access Control Parameters، وبرضو بباسورد.",
  },
  {
    title: "ارجع التيم من الملفات",
    body: "على التيم الجديد اعمل نفس المناطق والأقسام ومستويات الوصول. فك ربط الأجهزة من التيم القديم، وضيفها بالسيريال وكود التحقق. بعدين Person ثم Import ثم Import Person Information via Excel، وافتح تمبلت الخطوة الأولى. إعدادات كل جهاز تترجّع من ملف الخطوة الثالثة، وتكتب باسورد التصدير.",
  },
];

const chapters: { title: string; body: string[] }[] = [
  {
    title: "الجهاز نفسه: DS-K1T342",
    body: [
      "سلسلة 342 جهاز تعرّف على الوجه، وفيه بصمة وكارت ورقم سري. السيريال موجود في System على شاشة الجهاز، أو في الويب تحت System Settings.",
      "ادخل على ويب الجهاز من عنوانه على الشبكة. اليوزر غالباً admin. غيّر الباسورد الافتراضي بعد التفعيل.",
      "عشان الجهاز يظهر Online على هيك-كونكت: من الويب Configuration ثم Network ثم Advanced Settings ثم Platform Access. فعّل Hik-Connect. سيب عنوان السيرفر زي ما هو، والافتراضي litedev.hik-connect.com. اكتب Verification Code من عندك واحفظه.",
      "بعد الحفظ لازم Register Status يبقى Online. لو Offline: النت، أو الكود غلط، أو الجهاز مربوط بحساب قديم.",
    ],
  },
  {
    title: "توحيد اليوزرات",
    body: [
      "رقم الموظف على الجهاز هو نفسه Person ID على التيم. لو عملت الشخص من جديد برقم مختلف، هيطلع اتنين ومش هتتجمع البصمات.",
      "أحسن طريقة: Import Persons from Device. التيم يسحب الاسم والرقم والصورة والبصمة والكارت والـ PIN زي ما هم على الجهاز.",
    ],
  },
  {
    title: "عشان الناس تبقى Online",
    body: [
      "الجهاز Online لوحده مش كفاية. اعمل Access Level على باب الجهاز، واربط الشخص أو القسم بالمستوى ده.",
      "الصورة المقبولة JPG، عرضها 640 على الأقل، وحجمها تقريباً من 60 إلى 200 كيلو.",
    ],
  },
  {
    title: "الكروت والحضور",
    body: [
      "الكارت يتضاف من صفحة الشخص، أو دفعة واحدة من تمبلت الإكسل في عمود Card No. من غير مستوى وصول الكارت مش هيفتح.",
      "تقرير Transaction هو البصمات الخام. First In Last Out أحياناً يطلع 00:00 و 23:59 لو الوردية ضيقة. وسّع مدى الدخول والخروج.",
    ],
  },
];

const links = [
  ["ترجمة الفيديو PDF", "https://github.com/Medo200333/awwal-akher-pc/raw/main/docs/hikconnect-teams-guide.pdf"],
  ["الفيديو الإسباني", "https://www.youtube.com/watch?v=ZGWnYzV-gmY"],
  ["إعداد الأكسس من البوابة", "https://www.youtube.com/watch?v=HH356eVSsaU"],
  ["دليل سلسلة 342", "https://www.hikvision.com/content/dam/hikvision/products/S000000001/S000000080/S000000103/S000000107/OFR000141/M000054133/User_Manual/UD25849B-C_Baseline_DS-K1T342-Series-Face-Recognition-Terminal_User-Manual_V3.0_20240219.pdf"],
];

function guideHtml(): string {
  const ordered = steps.map((step, index) => `<h2>${index + 1}. ${step.title}</h2><p>${step.body}</p>`).join("");
  const body = chapters
    .map((chapter) => `<h2>${chapter.title}</h2>${chapter.body.map((line) => `<p>${line}</p>`).join("")}`)
    .join("");
  const refs = links.map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>دليل الباك أب</title>
<style>body{font-family:sans-serif;background:#e7ebf0;color:#1c2834;margin:0}main{max-width:840px;margin:auto;padding:32px 20px}h1,h2{color:#0c3d66}h2{border-bottom:2px solid #d5dee7;padding-bottom:6px}p,li{line-height:1.8}</style>
</head><body><main><p>SKY LINE</p><h1>دليل الباك أب — هيك-كونكت تيم</h1>${ordered}${body}<h2>المراجع</h2><ul>${refs}</ul></main></body></html>`;
}

export function HikGuide({ onClose }: { onClose: () => void }) {
  function download() {
    const blob = new Blob([guideHtml()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "دليل-الباك-اب.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-brass">دليل الباك أب</h2>
        <div className="flex gap-2">
          <button type="button" onClick={download} className="h-11 rounded-md bg-brass px-4 font-medium text-brass-ink">
            تصدير الملف
          </button>
          <button type="button" onClick={onClose} className="h-11 rounded-md border border-line px-4 font-medium">
            اغلاق
          </button>
        </div>
      </div>
      <ol className="mb-6 flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-md border border-line bg-canvas p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brass font-semibold text-brass-ink">
              {index + 1}
            </span>
            <span>
              <strong className="block">{step.title}</strong>
              <span className="mt-1 block text-sm leading-7 text-ink">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-6">
        {chapters.map((chapter) => (
          <article key={chapter.title}>
            <h3 className="mb-2 text-lg font-semibold">{chapter.title}</h3>
            {chapter.body.map((line) => (
              <p key={line} className="mb-2 text-sm leading-7 text-ink">
                {line}
              </p>
            ))}
          </article>
        ))}
        <article>
          <h3 className="mb-2 text-lg font-semibold">الملفات والفيديو</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {links.map(([label, href]) => (
              <li key={href}>
                <a className="text-brass underline" href={href} target="_blank" rel="noreferrer">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
