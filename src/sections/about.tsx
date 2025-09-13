
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Linkedin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { TeamMember, GeneralSettings, SectionPadding, Alignment } from '@/types/settings';
import { cn } from '@/lib/utils';


const defaultTeam: TeamMember[] = [
  {
    name: 'Alex Andersen',
    title: 'Lead Developer & Arkitekt',
    description: 'Specialist i skalerbare systemer og komplekse integrationer. Elsker at bygge robuste løsninger.',
    imageUrl: 'https://picsum.photos/200/200?random=8',
    linkedinUrl: '#',
    aiHint: 'male portrait',
  },
  {
    name: 'Maria Jensen',
    title: 'AI & Data Specialist',
    description: 'Transformerer data til forretningsværdi gennem machine learning og intelligente automatiseringer.',
    imageUrl: 'https://picsum.photos/200/200?random=9',
    linkedinUrl: '#',
    aiHint: 'female portrait',
  },
  {
    name: 'Jesper Nielsen',
    title: 'Digital Strateg & Projektleder',
    description: 'Sikrer at teknologien understøtter forretningsmålene og at projekter leveres til tiden.',
    imageUrl: 'https://picsum.photos/200/200?random=10',
    linkedinUrl: '#',
    aiHint: 'man portrait',
  },
];

const defaultAboutText = "Digifly er et agilt konsulenthus grundlagt af erfarne teknologer med en passion for at skabe flow. Vi tror på, at de rigtige digitale løsninger kan frigøre potentiale og drive markant vækst. Vores mission er at være jeres betroede partner på den digitale rejse – fra idé til implementering og skalering.";

interface AboutSectionProps {
  settings: GeneralSettings | null;
}

export default function AboutSection({ settings }: AboutSectionProps) {
    const team = settings?.teamMembers && settings.teamMembers.length > 0 ? settings.teamMembers : defaultTeam;
    const aboutText = settings?.aboutText || defaultAboutText;
    const title = settings?.aboutSectionTitle || "Hvem er Digifly?";
    const alignment = settings?.aboutSectionAlignment || 'left';

    const titleStyle: React.CSSProperties = {
        fontSize: settings?.aboutSectionTitleSize ? `${settings.aboutSectionTitleSize}px` : undefined,
    };
    const textStyle: React.CSSProperties = {
        fontSize: settings?.aboutTextSize ? `${settings.aboutTextSize}px` : undefined,
    };
    
    const teamMemberNameStyle: React.CSSProperties = {
        fontSize: settings?.teamMemberNameSize ? `${settings.teamMemberNameSize}px` : undefined,
    };
    const teamMemberTitleStyle: React.CSSProperties = {
        fontSize: settings?.teamMemberTitleSize ? `${settings.teamMemberTitleSize}px` : undefined,
    };
    const teamMemberDescriptionStyle: React.CSSProperties = {
        fontSize: settings?.teamMemberDescriptionSize ? `${settings.teamMemberDescriptionSize}px` : undefined,
    };

    const sectionPadding = settings?.sectionPadding?.about;
    
    const style: React.CSSProperties & { [key: string]: string } = {
        '--padding-top-mobile': sectionPadding?.topMobile !== undefined ? `${sectionPadding.topMobile}px` : '48px',
        '--padding-bottom-mobile': sectionPadding?.bottomMobile !== undefined ? `${sectionPadding.bottomMobile}px` : '48px',
        '--padding-top': sectionPadding?.top !== undefined ? `${sectionPadding.top}px` : '96px',
        '--padding-bottom': sectionPadding?.bottom !== undefined ? `${sectionPadding.bottom}px` : '96px',
    };

    const alignmentClasses = {
        left: 'text-left items-start',
        center: 'text-center items-center',
        right: 'text-right items-end',
    };
    
    const textContent = (
         <div className={cn("space-y-6", alignmentClasses[alignment])}>
            <h2 
            className={cn("text-h2 font-bold tracking-tight", settings?.aboutSectionTitleColor || "text-black")}
            style={titleStyle}
            >
            {title}
            </h2>
            <p 
            className={cn("text-body whitespace-pre-wrap", settings?.aboutTextColor || "text-muted-foreground")}
            style={textStyle}
            >
            {aboutText}
            </p>
        </div>
    );
    
    const teamContent = (
        <div className="grid grid-cols-1 gap-8">
            {team.map((member) => (
            <div key={member.name} className="flex items-start space-x-4">
                <Avatar className="w-16 h-16 border-2 border-primary">
                <AvatarImage src={member.imageUrl} alt={`${member.name} - ${member.title}`} data-ai-hint={member.aiHint} />
                <AvatarFallback>{member.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                <div className="flex items-center justify-between">
                    <div>
                    <h3 className={cn("font-semibold", settings?.teamMemberNameColor)} style={teamMemberNameStyle}>{member.name}</h3>
                    <p className={cn("text-sm", settings?.teamMemberTitleColor)} style={teamMemberTitleStyle}>{member.title}</p>
                    </div>
                    <Link href={member.linkedinUrl} target="_blank" aria-label={`${member.name} on LinkedIn`}>
                        <Linkedin className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                    </Link>
                </div>
                <p className={cn("mt-2 text-sm", settings?.teamMemberDescriptionColor)} style={teamMemberDescriptionStyle}>{member.description}</p>
                </div>
            </div>
            ))}
        </div>
    );

    return (
        <section 
            id="om-os" 
            className="bg-secondary py-[var(--padding-top-mobile)] md:py-[var(--padding-top)] pb-[var(--padding-bottom-mobile)] md:pb-[var(--padding-bottom)]"
            style={style}
        >
            <div className="container mx-auto max-w-7xl px-4 md:px-6">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-24 items-center">
                   {alignment === 'right' ? (
                       <>
                        {teamContent}
                        {textContent}
                       </>
                   ) : (
                       <>
                        {textContent}
                        {teamContent}
                       </>
                   )}
                </div>
            </div>
        </section>
    );
}
