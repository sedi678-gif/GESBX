import Link from 'next/link';

export const metadata = { title: 'Məxfilik siyasəti | GESBX' };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px', color: '#e2e8f0', lineHeight: 1.7 }}>
      <p style={{ color: '#fbbf24', fontWeight: 700 }}>DƏRC ÜÇÜN HÜQUQİ YOXLAMA LAZIMDIR</p>
      <h1>Məxfilik siyasəti</h1>
      <p>Son yenilənmə: 18 oktyabr 2026</p>
      <p><strong>Məlumatlara nəzarət edən:</strong> [Hüquqi şəxsin tam adı], [qeydiyyat ünvanı], [məxfilik üçün əlaqə e-poçtu]. Bu məlumatlar tamamlanmadan bu sənəd yekun siyasət sayılmır.</p>

      <h2>Toplanan məlumatlar</h2>
      <p>GESBX hesabı yaratdıqda hesab identifikatoru, profil məlumatları və doğum tarixi kimi təqdim etdiyiniz məlumatlar işlənir. Profil şəkli, paylaşım, şərh, bəyənmə, mesaj və dəstək sorğuları kimi yaratdığınız məzmun da xidmət daxilində saxlanıla bilər. Zənglər zamanı hesab və otaq identifikatorları ZEGOCLOUD xidmətinə ötürülür. Tətbiqdə öz istəyinizlə paylaşdığınız media və məkan məlumatı yalnız seçdiyiniz funksiyalar üçün istifadə olunur.</p>
      <p>Texniki qeydlər, təhlükəsizlik, saxtakarlığın qarşısının alınması və xidmətin işləməsi üçün lazım olan identifikatorlar və əməliyyat qeydləri də yarana bilər. Hazırda tətbiqdə Play Billing və ya real pul köçürməsi inteqrasiyası yoxdur; çıxarış sorğusu göndərsəniz, sorğuda yazdığınız ödəniş məlumatı əl ilə baxış üçün saxlanıla bilər.</p>

      <h2>Xidmət təminatçıları</h2>
      <p>Hesab, verilənlər bazası və fayl saxlanması Firebase/Google xidmətlərindən; səsli və video zənglər ZEGOCLOUD-dan istifadə edir. Socket.IO aktivdirsə, onlayn status və siqnallaşma ayrıca host edilən serverdən keçir. Bu provayderlərin məlumat emalı şərtləri və regionları hüquqi şəxs tərəfindən dərcdən əvvəl göstərilməlidir.</p>

      <h2>Saxlanma və silinmə</h2>
      <p>Məlumatlar hesabınız aktiv olduğu və xidmət göstərmək üçün lazım olduğu müddətdə saxlanılır. Bəzi paylaşım növlərinin vaxt məhdudiyyəti var; bu, bütün hesab və mesaj məlumatlarının həmin müddətdə silinməsi demək deyil. Hesabınızı tətbiqdəki silmə funksiyası ilə silə bilərsiniz. Hüquqi, təhlükəsizlik və mübahisə qeydləri qanunun icazə verdiyi zəruri müddət ərzində qala bilər; tətbiq edilən müddətlər operator tərəfindən dəqiqləşdirilməlidir.</p>

      <h2>Uşaqlar və yaş tələbi</h2>
      <p>Xidmət 13 yaşdan kiçik şəxslər üçün nəzərdə tutulmayıb. Yaş tələbləri, valideyn razılığı və yerli qanunvericiliyə uyğun yoxlama mexanizmi dərcdən əvvəl operator tərəfindən təsdiqlənməlidir.</p>

      <h2>Təhlükəsizlik və hüquqlar</h2>
      <p>Girişə nəzarət və xidmət təminatçılarının təhlükəsizlik vasitələri tətbiq olunur. İnternet üzərindən ötürülən və saxlanılan məlumat üçün mütləq təhlükəsizlik zəmanəti verilmir. Yaşadığınız yerin qanunları ilə verilən məlumatlara çıxış, düzəliş, silinmə və etiraz hüquqları üçün aşağıdakı əlaqə vasitəsindən istifadə edin.</p>
      <p><strong>Əlaqə:</strong> [məxfilik əlaqə e-poçtu]</p>
      <p><Link href="/terms">İstifadə şərtləri</Link> · <Link href="/">GESBX ana səhifəsi</Link></p>
    </main>
  );
}
