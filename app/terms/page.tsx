import Link from 'next/link';

export const metadata = { title: 'İstifadə şərtləri | GESBX' };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px', color: '#e2e8f0', lineHeight: 1.7 }}>
      <p style={{ color: '#fbbf24', fontWeight: 700 }}>DƏRC ÜÇÜN HÜQUQİ YOXLAMA LAZIMDIR</p>
      <h1>GESBX istifadə şərtləri</h1>
      <p>Son yenilənmə: 18 oktyabr 2026</p>
      <p><strong>Xidmət operatoru:</strong> [Hüquqi şəxsin tam adı və qeydiyyat ünvanı]. Şirkət və əlaqə məlumatları təsdiqlənmədən bu şərtlər yekun sənəd deyil.</p>

      <h2>Hesab və istifadə</h2>
      <p>Hesab məlumatlarınızın düzgünlüyünə və hesabınızdan edilən fəaliyyətə görə məsuliyyət daşıyırsınız. Başqa şəxsin hesabına daxil olmayın, xidməti pozmağa, avtomatlaşdırılmış sui-istifadəyə və ya digər istifadəçilərin hüquqlarını pozmağa çalışmayın.</p>

      <h2>İstifadəçi məzmunu və təhlükəsizlik</h2>
      <p>Yalnız paylaşmaq hüququnuz olan məzmunu yükləyin. Təhdid, təqib, qanunsuz məzmun, fırıldaqçılıq və başqasının şəxsi məlumatını icazəsiz yaymaq qadağandır. İstifadəçilər məzmunu şikayət və bloklama vasitələrindən istifadə edə bilərlər. Operator şikayətləri araşdırıb qanun və təhlükəsizlik tələblərinə uyğun tədbir görə bilər.</p>

      <h2>Rəqəmsal göstəricilər və ödənişlər</h2>
      <p>Oyun xalları, reytinqlər və daxili göstəricilər, ayrıca yazılı qayda olmadıqda, nağd pul və ya geri qaytarıla bilən dəyər sayılmır. Hazırda tətbiqdə Play Billing və ya real ödəniş provayderi qoşulmayıb. Çıxarış sorğuları əl ilə yoxlanıla bilər və təsdiq edilmiş ödəniş vədi deyil.</p>

      <h2>Hesabın məhdudlaşdırılması və xidmətin dəyişməsi</h2>
      <p>Şərtlərin pozulması, təhlükəsizlik riski və ya hüquqi tələb olduqda hesaba girişi müvəqqəti məhdudlaşdırmaq və ya dayandırmaq mümkündür. Xidmətin əlçatanlığına fasiləsiz zəmanət verilmir. Tətbiq və şərtlər dəyişdikdə yenilənmiş mətn bu səhifədə göstəriləcək.</p>

      <h2>Tətbiq olunan hüquq və əlaqə</h2>
      <p>Tətbiq olunan hüquq, mübahisələrin həlli qaydası və məcburi istehlakçı hüquqları operator və hüquqşünas tərəfindən dərcdən əvvəl doldurulub təsdiqlənməlidir.</p>
      <p><strong>Əlaqə:</strong> [hüquqi əlaqə e-poçtu]</p>
      <p><Link href="/privacy">Məxfilik siyasəti</Link> · <Link href="/">GESBX ana səhifəsi</Link></p>
    </main>
  );
}
