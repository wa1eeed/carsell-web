-- قيدٌ يدويّ على حساب مزوّد — مالُ طرفٍ ثالث لا يمسّه واحد.
ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'PROVIDER_ADJUSTMENT';
