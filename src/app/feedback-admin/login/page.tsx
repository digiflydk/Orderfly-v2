import { redirect } from 'next/navigation';

// Keep existing bookmarks working through the shared administration session.
export default function FeedbackLogin() {
  redirect('/superadmin/feedback');
}
