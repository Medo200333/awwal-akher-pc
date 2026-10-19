const chapters: { title: string; body: string[] }[] = [
  {
    title: "1. الجهاز نفسه: DS-K1T342",
    body: [
      "سلسلة 342 جهاز تعرّف على الوجه، وفيه بصمة وكارت ورقم سري. السيريال موجود في System على شاشة الجهاز، أو في الويب تحت System Settings.",
      "ادخل على ويب الجهاز من عنوانه على الشبكة. اليوزر غالباً admin. غيّر الباسورد الافتراضي بعد التفعيل.",
      "عشان الجهاز يظهر Online على هيك-كونكت: من الويب Configuration ثم Network ثم Advanced Settings ثم Platform Access. فعّل Hik-Connect. سيب عنوان السيرفر زي ما هو، والافتراضي litedev.hik-connect.com. اكتب Verification Code من عندك واحفظه، لأن نفس الكود هيتطلب لما تضيف الجهاز على التيم.",
      "بعد الحفظ لازم Register Status يبقى Online. لو Offline: النت، أو الكود غلط، أو الجهاز مربوط بحساب قديم.",
    ],
  },
  {
    title: "2. باك أب الكونفيجريشن من الجهاز",
    body: [
      "من شاشة الجهاز: حط فلاشة USB. من Home اختار Data ثم Export Data. صدّر أربعة ملفات: User Data، Face Data، Event Data، و Access Control Parameters. الملف الأخير هو كونفيجريشن الجهاز نفسه.",
      "تقدر تحط باسورد على التصدير. لما تنقل الملف لجهاز تاني هتكتبه. الفلاشة من 1 جيجا لـ 256، وفاضي فيها أكتر من 512 ميجا. الملف بينزل ZIP.",
      "من الويب: Maintenance and Security ثم Maintenance ثم Backup and Reset. Export تحت Device Parameters يطلّع إعدادات الجهاز. Data Migration يطلّع المستخدمين والكارتات والإعدادات مع بعض، وده الأنسب لو هتنقل جهاز كامل.",
      "الاسترجاع: Data ثم Import Data، واختار نفس النوع، واكتب باسورد التصدير لو كنت حاطط واحد.",
    ],
  },
  {
    title: "3. هيك-كونكت تيم من الأول",
    body: [
      "ادخل على hik-connect.com واختار Phone، وبعدين Team مش الحساب الشخصي. التيم هو اللي فيه الأشخاص والأبواب والحضور.",
      "اعمل Area لكل فرع. عندك alex و cairo dawn tawen و mansora و Masr el gdeda، فكل فرع Area لوحده.",
      "ضيف الجهاز: Device ثم Add، بالسيريال و Verification Code اللي كتبته على الجهاز. حطه جوه الـ Area بتاع الفرع. من غير Area الجهاز مش هيربط الناس صح.",
      "لو الجهاز مربوط بحساب قديم، فك الربط الأول من الحساب القديم: Device ثم Unbind. الجهاز ما يبقاش على حسابين.",
    ],
  },
  {
    title: "4. توحيد اليوزرات قبل أي حاجة",
    body: [
      "رقم الموظف على الجهاز هو نفسه Person ID على التيم. لو عملت الشخص من جديد برقم مختلف، هيطلع اتنين ومش هتتجمع البصمات.",
      "أحسن طريقة: Import Persons from Device. التيم يسحب الاسم والرقم والصورة والبصمة والكارت والـ PIN زي ما هم على الجهاز.",
      "لو هتنقل لتيم جديد: من التيم القديم Person ثم Export Person Information. حط باسورد للـ ZIP، وعلّم Access Level و Schedule عشان يطلعوا مع الناس.",
      "على التيم الجديد: اعمل نفس الأقسام، وبعدين Import ثم Import Person Information via Excel، أو اسحبهم من الجهاز بعد ما تضيفه.",
    ],
  },
  {
    title: "5. عشان الناس كلها تبقى Online على البصمة",
    body: [
      "الجهاز Online لوحده مش كفاية. الشخص مش بينزل على الجهاز غير بالخطوات دي بالترتيب.",
      "اعمل Access Level: Access Control ثم Access Level ثم Add. اختار الـ Area، واختار باب الجهاز، واختار الجدول. احفظ.",
      "اربط الشخص بالمستوى: Assign by Person أو Assign by Department. لو القسم مربوط، كل الناس اللي جوه تنزل مرة واحدة.",
      "بعد الحفظ استنى المزامنة. من صفحة الشخص شوف حالة التطبيق على الجهاز. لو Failed: الجهاز Offline، أو الصورة مرفوضة، أو الشخص مش في نفس الـ Area.",
      "الصورة المقبولة JPG، عرضها 640 على الأقل، وحجمها تقريباً من 60 إلى 200 كيلو. صورة التليفون الكبيرة أحياناً تترفض.",
      "البصمة والكارت والـ PIN يتسجلوا من صفحة الشخص، أو على الجهاز نفسه. اللي اتسجل على الجهاز يتجاب مع Import from Device.",
    ],
  },
  {
    title: "6. الكروت",
    body: [
      "من صفحة الشخص تقدر تضيف كارت واحد. للكروت الكتير: Import via Excel وعلّم عمود Card No. في التمبلت. الرقم على الكارت هو اللي يتكتب، من غير مسافات زيادة.",
      "بعد الاستيراد لازم نفس الـ Access Level. الكارت من غير مستوى وصول مش هيفتح الباب حتى لو الشخص موجود.",
    ],
  },
  {
    title: "7. الحضور والانصراف",
    body: [
      "الناس والأبواب الأول، وبعدين Time and Attendance. اعمل الوردية: بداية ونهاية، والسماح بالدخول والخروج. لو المدى ضيق، البصمة بتترفض من تقرير الحضور حتى لو الجهاز سجلها.",
      "اربط الوردية بالموظف أو بالقسم. تقرير Transaction هو كل البصمات الخام. First In Last Out هو أول وآخر بصمة بعد ما النظام يطبّق الوردية، وعشان كده أحياناً يطلع 00:00 و 23:59. للتقرير الحقيقي استخدم Transaction.",
      "التقرير يتفلتر بالفرع والجهاز والفترة، وبعدين Filter.",
    ],
  },
  {
    title: "8. نقل التيم لحساب جديد، بنفس الداتا",
    body: [
      "من الجهاز: صدّر User Data و Face Data و Access Control Parameters على فلاشة.",
      "من التيم القديم: صدّر الأشخاص مع مستويات الوصول والجداول. صدّر قائمة الأجهزة بالسيريال.",
      "فك ربط الأجهزة من الحساب القديم.",
      "على الحساب الجديد: نفس الـ Areas، نفس الأقسام، ضيف الأجهزة بنفس كود التحقق، استورد الأشخاص، اعمل مستويات الوصول، واربطها بالناس أو بالأقسام.",
      "استنى الكل يبقى Online، وجرب شخص واحد على الجهاز قبل ما تسلم الشغل.",
    ],
  },
];

const links = [
  ["إعداد الأكسس من بوابة التيم", "https://www.youtube.com/watch?v=HH356eVSsaU"],
  ["نفس الإعداد من تطبيق هيك-كونكت", "https://www.youtube.com/watch?v=j4vy8dgjqZs"],
  ["شرح طويل: تيم، أشخاص، بصمة، كارت، حضور", "https://www.youtube.com/watch?v=ZGWnYzV-gmY"],
  ["دليل سلسلة 342 من هيكفيجن", "https://www.hikvision.com/content/dam/hikvision/products/S000000001/S000000080/S000000103/S000000107/OFR000141/M000054133/User_Manual/UD25849B-C_Baseline_DS-K1T342-Series-Face-Recognition-Terminal_User-Manual_V3.0_20240219.pdf"],
];

function guideHtml(): string {
  const body = chapters
    .map(
      (chapter) =>
        `<h2>${chapter.title}</h2>${chapter.body.map((line) => `<p>${line}</p>`).join("")}`,
    )
    .join("");
  const refs = links.map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>دليل هيك-كونكت تيم</title>
<style>body{font-family:sans-serif;background:#e7ebf0;color:#1c2834;margin:0}main{max-width:840px;margin:auto;padding:32px 20px}h1{color:#0c3d66}h2{color:#0c3d66;border-bottom:2px solid #d5dee7;padding-bottom:6px}p{line-height:1.8}</style>
</head><body><main><p>SKY LINE</p><h1>دليل هيك-كونكت تيم وجهاز 342</h1>${body}<h2>المراجع</h2><ul>${refs}</ul></main></body></html>`;
}

export function HikGuide({ onClose }: { onClose: () => void }) {
  function download() {
    const blob = new Blob([guideHtml()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "دليل-هيك-كونكت-تيم.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-brass">دليل هيك-كونكت تيم</h2>
        <div className="flex gap-2">
          <button type="button" onClick={download} className="h-11 rounded-md bg-brass px-4 font-medium text-brass-ink">
            نزّل الدليل
          </button>
          <button type="button" onClick={onClose} className="h-11 rounded-md border border-line px-4 font-medium">
            اغلاق
          </button>
        </div>
      </div>
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
          <h3 className="mb-2 text-lg font-semibold">فيديوهات والدليل الرسمي</h3>
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
