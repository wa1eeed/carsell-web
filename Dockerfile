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

# كذلك هنا — و`next build` يُخرج إنتاجًا بلا حاجة إلى هذا المتغيّر
ENV NODE_ENV=development

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

# المخطّط والترحيلات تلزم `migrate deploy` عند الإقلاع
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# الفحص الصحّي على مسارٍ يلمس القاعدة — وصفحةٌ ساكنة تردّ ٢٠٠ وقاعدتها ساقطة
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
