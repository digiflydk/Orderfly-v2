export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function SuperAdminSafe() {
  return (
    <div style={{padding:16, fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:20,fontWeight:600}}>SuperAdmin Safe OK • OF-330</h1>
      <p style={{marginTop:8}}>Alle /superadmin ruter peger hertil midlertidigt.</p>
    </div>
  );
}
