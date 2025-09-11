
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Placeholder data - in a real app, this would be fetched and saved
const mockSettings = {
  sendDelayHours: 24,
  reminderCount: 2,
  reminderIntervalHours: 48,
  feedbackInvitationTemplate: `<h1>Hi {customerName},</h1>
<p>Thanks for your order from {brandName}!</p>
<p>Please take a moment to give us your feedback on order #{orderId}:</p>
<a href="{feedbackLink}">Give Feedback</a>`,
  autoResponseTemplate: `<h2>Thanks for your feedback!</h2>
<p>We appreciate you taking the time to help us improve.</p>`,
};

export default function FeedbackSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feedback Settings</h1>
        <p className="text-muted-foreground">
          Configure email triggers and templates for the customer feedback module.
        </p>
      </div>

      <form className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Trigger Configuration</CardTitle>
            <CardDescription>
              Define the automated workflow for sending feedback requests after an order is completed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sendDelayHours">Send Delay (Hours)</Label>
                <Input id="sendDelayHours" name="sendDelayHours" type="number" defaultValue={mockSettings.sendDelayHours} />
                <p className="text-sm text-muted-foreground">Delay before sending the first feedback email.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminderCount">Number of Reminders</Label>
                <Input id="reminderCount" name="reminderCount" type="number" defaultValue={mockSettings.reminderCount} />
                 <p className="text-sm text-muted-foreground">How many reminders to send if no response.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminderIntervalHours">Reminder Interval (Hours)</Label>
                <Input id="reminderIntervalHours" name="reminderIntervalHours" type="number" defaultValue={mockSettings.reminderIntervalHours} />
                 <p className="text-sm text-muted-foreground">Hours to wait between each reminder.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email Templates</CardTitle>
            <CardDescription>
              Customize the content of emails sent to customers. Use placeholders for dynamic content.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="feedbackInvitationTemplate" className="text-lg font-semibold">Feedback Invitation Email</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Available placeholders: <code className="text-xs">{`{customerName}`}</code>, <code className="text-xs">{`{orderId}`}</code>, <code className="text-xs">{`{brandName}`}</code>, <code className="text-xs">{`{feedbackLink}`}</code>.
              </p>
              <Textarea id="feedbackInvitationTemplate" name="feedbackInvitationTemplate" rows={10} defaultValue={mockSettings.feedbackInvitationTemplate} />
            </div>
            <Separator />
            <div>
              <Label htmlFor="autoResponseTemplate" className="text-lg font-semibold">Auto-response Confirmation</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Email sent immediately after a customer submits their feedback.
              </p>
              <Textarea id="autoResponseTemplate" name="autoResponseTemplate" rows={6} defaultValue={mockSettings.autoResponseTemplate} />
            </div>
          </CardContent>
        </Card>
        
        <div className="flex justify-end">
            <Button type="submit">Save Settings</Button>
        </div>
      </form>
    </div>
  );
}
