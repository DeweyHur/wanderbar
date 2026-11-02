/** Landing page for invite links opened outside the app: hands the token to the app via its URL scheme. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appUrl = `wanderbar://invite/${encodeURIComponent(token)}`;
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 420, margin: "64px auto", padding: "0 16px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22 }}>그룹 초대</h1>
      <p>앱이 설치되어 있으면 아래 버튼으로 열어 초대를 받으세요. 앱에서 구글 로그인 후 그룹에 들어갑니다.</p>
      <p>
        <a href={appUrl} style={{ display: "inline-block", padding: "12px 20px", background: "#111", color: "#fff", borderRadius: 10, textDecoration: "none" }}>
          앱에서 열기
        </a>
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>초대 링크는 7일 뒤 만료돼요.</p>
    </main>
  );
}
