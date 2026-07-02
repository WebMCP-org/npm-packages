import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { siteConfig } from '@/lib/config';

export function FAQSection() {
  const { faqSection } = siteConfig;

  return (
    <section id="faq" className="w-full relative">
      <div className="mx-auto">
        <div className="grid md:grid-cols-6 lg:divide-x divide-border">
          <div className="col-span-2 flex flex-col gap-4 p-8 md:p-12">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tighter text-left text-balance">
              {faqSection.title}
            </h2>
            <p className="text-muted-foreground text-left text-balance font-medium">
              {faqSection.description}
            </p>
          </div>

          <div className="col-span-4 w-full p-8 md:p-12">
            <Accordion type="single" collapsible className="w-full">
              {faqSection.faQitems.map((faq, index) => (
                <AccordionItem
                  key={faq.id}
                  value={index.toString()}
                  className="border-b border-border py-4 first:pt-0"
                >
                  <AccordionTrigger className="text-left no-underline hover:no-underline py-0 text-base">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pt-4 pb-0">
                    <p className="leading-relaxed">{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
