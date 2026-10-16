# 🐾 Animal Town — مدينة الحيوانات

مدينة ثلاثية الأبعاد كل متابع فيها يصير ساكناً على شكل حيوان.
A 3D town where every follower becomes an animal resident.

---

## 🎮 التشغيل على حاسوبك (أنت تبني وتصوّر)

اضغط مرتين على **`START-GAME.bat`**. تُفتح اللعبة في المتصفح مع لوحة التحكم الكاملة.
مدينتك تُحفظ تلقائياً في متصفحك.

---

## 🌍 نشر المدينة لمتابعيك (GitHub Pages — مجاناً)

المتابعون يفتحون رابطاً مثل `https://اسمك.github.io/animal-town/`، فيرون مدينتك، ويبحثون عن شخصياتهم، ويشاهدون بطاقاتهم.
**هم يشاهدون فقط، ولا يستطيعون التعديل.** أنت تعدّل على حاسوبك ثم ترفع نسخة جديدة.

### الطريقة 1: من موقع GitHub مباشرة (الأسهل)

1. ادخل **github.com** وأنشئ حساباً (أو سجّل دخولك).
2. اضغط **+** أعلى الصفحة ← **New repository**.
   - Repository name: `animal-town`
   - اختر **Public**
   - اضغط **Create repository**
3. في الصفحة الجديدة اضغط الرابط **uploading an existing file**.
4. افتح مجلد اللعبة على حاسوبك، واسحب إلى صفحة GitHub:
   `index.html` و `README.md` و `.nojekyll` و `START-GAME.bat` و `server.py`، والمجلدين **`css`** و **`js`** كاملين.
   ثم اضغط **Commit changes** أسفل الصفحة.
5. اذهب إلى **Settings** ← **Pages** (في القائمة الجانبية).
   - Source: **Deploy from a branch**
   - Branch: **main** و **/ (root)** ← **Save**
6. انتظر دقيقة أو دقيقتين ثم حدّث الصفحة. يظهر رابطك أعلى صفحة Pages:
   `https://اسم-حسابك.github.io/animal-town/`

### الطريقة 2: GitHub Desktop (أسهل للتحديثات الكثيرة)

1. نزّل **GitHub Desktop** من desktop.github.com وسجّل دخولك.
2. **File ← Add local repository** ← اختر مجلد اللعبة (هو جاهز كمستودع git).
3. اضغط **Publish repository**، وأزل علامة **Keep this code private**.
4. فعّل Pages كما في الخطوة 5 من الطريقة 1.
5. بعد أي تعديل: اكتب وصفاً صغيراً ← **Commit to main** ← **Push origin**.

---

## 🔄 تحديث المدينة التي يراها المتابعون

1. في اللعبة على حاسوبك: قسم **المدينة** ← **💾 حفظ المدينة في ملف**، فيُحمَّل ملف **`town.json`**.
2. في مشروعك على GitHub: **Add file ← Upload files** ← اسحب `town.json` ← **Commit changes**.
   (أو ضعه في مجلد اللعبة وارفعه بـ GitHub Desktop.)
3. خلال دقيقتين تقريباً يتحدث الموقع. **الصفحات المفتوحة عند المتابعين تتحدث وحدها** (تفحص كل 90 ثانية).

> 💡 اكتب رابط موقعك في اللعبة في خانة **«عنوان موقعك»** في قسم المدينة، فيصير زر **«🔗 نسخ رابط هذا الساكن»** ينسخ رابطاً عاماً يفتح الموقع مباشرة على ذلك الساكن، مثل
> `https://اسمك.github.io/animal-town/?follow=sara_art`
> ضع الرابط في البايو أو في الرد على تعليق المتابع.

---

## ⚠️ ملاحظات مهمة

- المستودع **عام**، أي أن أي شخص يستطيع رؤية الملفات وملف `town.json` (أسماء المتابعين وأهدافهم). لا تضع فيه شيئاً خاصاً.
- **مفتاح Claude API لا يُرفع أبداً.** هو محفوظ في متصفحك فقط، وليس في أي ملف.
- الموقع يحتاج إنترنت لتحميل مكتبة Three.js.
- لفتح المحرر على الموقع نفسه أضف `?edit` للرابط، لكنه يحفظ في متصفح ذلك الجهاز فقط. الأفضل أن تعدّل دائماً على حاسوبك.

---

## English (short)

1. Create a **public** GitHub repository (`animal-town`) and upload `index.html`, `.nojekyll`, `css/` and `js/` (or publish this folder with GitHub Desktop).
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. In the game on your PC: **Town → 💾 Save town to file**, then upload `town.json` to the repository. Open visitor pages refresh automatically.
4. Online, the site opens in **visitor mode** (read-only, search, profile cards). `?follow=username` opens a resident; `?edit` opens the editor.
