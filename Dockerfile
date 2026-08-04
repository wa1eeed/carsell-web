# ═══ صورة الإنتاج — ثلاث مراحل ═══
#
# القسم ١٢ من عقد التنفيذ. والمراحل الثلاث لأن صورة النشر يجب ألّا تحمل
# أدوات البناء ولا شيفرة المصدر: ما يصل الخادم هو `standalone` وحده.

# ─── ١· الاعتماديات وتوليد عميل Prisma ───
FROM node:22-alpine AS deps
WORKDIR /app

# ═══ البناء يحتاج تبعيّات التطوير — ولو حُقن `NODE_ENV=production` ═══
#
# **يُثبَّت هنا صراحةً ولا يُترك لما يحقنه المُنسِّق.** Coolify يمرّر
# متغيّرات التشغيل إلى البناء، و`NODE_ENV=production` تجعل `npm ci`
# يتخطّى `devDependencies` — فيسقط البناء على `@tailwindcss/postcss`
# ورسالتُه «Cannot find module» لا تقول إن السبب متغيّر بيئة.
# (وقع في أوّل نشر.)
ENV NODE_ENV=development

# `prisma` قبل `npm ci` لأن `postinstall` يولّد العميل منه
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --include=dev


# ─── ٢· البناء ───
FROM node:22-alpine AS build
WORKDIR /app

# ═══ والبناء بـ`production` — لا `development` ═══
#
# **هذا هو حاجز البناء الذي بحثنا عن سببه أسابيع.** `next build` بـ
# `NODE_ENV=development` يسقط عند تصدير `/404` بـ«<Html> should not be
# imported outside of pages/_document» — رسالةٌ لا تذكر `NODE_ENV`
# إطلاقًا، فيُبحث عن السبب في الشيفرة وهو في متغيّر بيئة.
#
# وتبعيّات التطوير **منسوخةٌ من المرحلة الأولى** فلا يحتاجها هذا
# المتغيّر: الأولى تُثبّت، والثانية تبني.
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# العميل يُولَّد هنا: `.next` تُمسح مع كل `db:generate`، فيسبقُه البناء
RUN npx prisma generate
RUN npm run build


# ─── ٣· التشغيل ───
FROM node:22-alpine AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# مستخدم غير جذر — حاويةٌ تعمل بـroot تُعطي أي ثغرةٍ صلاحيةَ الجذر
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `standalone` يحمل `server.js` وnode_modules المقتطعة
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# الساكن **خارج** standalone — ونسيانُه يُعرض الموقع بلا أيّ تنسيق
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# المخطّط يبقى في `/app` أيضًا — العميل المولَّد يقرؤه
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma

# ═══ أداة Prisma في مجلّدٍ معزول ═══
#
# **نسخُ `node_modules/prisma` و`@prisma` وحدهما لا يكفي**: الأداة
# تحتاج تبعيّاتٍ غير مباشرة (`effect` · `c12` · `deepmerge-ts` …) ولها
# هي تبعيّاتها — فيسقط الإقلاع بـ«Cannot find module 'effect'»،
# ورسالتُه تتّهم وحدةً لم نسمع بها. (وقع في أوّل إقلاع.)
#
# **وتُثبَّت في `/opt/prisma` لا في `/app`**: شجرة `standalone` مقتطعةٌ
# بعناية، و`npm install` داخلها قد يُعيد ترتيبها فيسقط الخادم نفسه —
# فنُصلح الترحيل ونكسر ما كان يعمل.
COPY --from=build /app/package.json /tmp/app-package.json
RUN mkdir -p /opt/prisma \
    && cd /opt/prisma \
    && npm init -y > /dev/null \
    && npm install --omit=optional --no-audit --no-fund \
         "prisma@$(node -p "require('/tmp/app-package.json').devDependencies.prisma")" \
    && rm /tmp/app-package.json

# ═══ والترحيل يُنفَّذ **داخل** `/opt/prisma` كلّه ═══
#
# `prisma.config.ts` يستورد `prisma/config`، ومن `/app` لا يُحلّ —
# فالأداة ليست هناك. فيسقط بـ«Cannot find module 'prisma/config'»،
# ورسالتُه تتّهم وحدةً موجودة… في مجلّدٍ آخر. (وقع في ثالث إقلاع.)
#
# فيُنسخ المخطّط والإعداد إلى جوار الأداة، ويُنفَّذ الأمر من هناك:
# كلٌّ يجد ما يستورده بجانبه.
COPY --from=build /app/prisma /opt/prisma/prisma
COPY --from=build /app/prisma.config.ts /opt/prisma/prisma.config.ts
RUN chown -R nextjs:nodejs /opt/prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# الفحص الصحّي يلمس القاعدة — وصفحةٌ ساكنة تردّ ٢٠٠ وقاعدتها ساقطة.
# و`wget` من busybox موجودٌ في alpine، والمهلة الأولى ٦٠ ثانية لأن
# الترحيلات تسبق الخادم.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
