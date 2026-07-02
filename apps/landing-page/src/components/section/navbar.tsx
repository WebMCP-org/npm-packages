'use client';

import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { siteConfig } from '@/lib/config';
import { Button } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from '@/components/ui/navigation-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

function HamburgerButton({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden relative z-50 flex size-8 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-accent"
      aria-label="Toggle menu"
    >
      <div className="relative size-5 flex items-center justify-center">
        <motion.span
          className="absolute h-0.5 w-4 bg-foreground"
          initial={false}
          animate={isOpen ? { rotate: 45, y: 0 } : { rotate: 0, y: -4 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute h-0.5 w-4 bg-foreground"
          initial={false}
          animate={isOpen ? { rotate: -45, y: 0 } : { rotate: 0, y: 4 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        />
      </div>
    </button>
  );
}

function DesktopNav() {
  return (
    <NavigationMenu className="ml-auto hidden md:flex">
      <NavigationMenuList className="gap-1">
        {siteConfig.nav.links.map((link) => (
          <NavigationMenuItem key={link.id}>
            {link.submenu ? (
              <>
                <NavigationMenuTrigger className="border border-transparent text-foreground rounded-full h-8 w-fit px-2 pl-3 data-[state=open]:bg-accent/50 data-[state=open]:border-border bg-transparent">
                  {link.name}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="p-0!">
                  <div className="grid w-[480px] grid-cols-1 gap-1 p-2">
                    {link.submenu.map((item) => (
                      <a
                        key={item.id}
                        href={item.href}
                        className="flex items-start gap-3 rounded-lg p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border rounded-lg bg-muted">
                          {item.icon}
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-medium">{item.name}</h3>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </NavigationMenuContent>
              </>
            ) : (
              <NavigationMenuLink
                asChild
                className="border border-transparent hover:border-border text-foreground rounded-full h-8 w-fit px-2 bg-transparent"
              >
                <a
                  href={link.href}
                  className="group inline-flex h-8 w-fit items-center justify-center rounded-full bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                >
                  {link.name}
                </a>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
      <NavigationMenuViewport className="shadow-2xl border border-border" />
    </NavigationMenu>
  );
}

function MobileNav({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
            style={{ top: '64px' }}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-0 right-0 bottom-0 z-50 w-full bg-background shadow-2xl md:hidden overflow-y-auto"
          >
            <div className="flex h-full flex-col">
              <nav className="flex-1 px-6 py-8 pb-32">
                <div className="grid grid-cols-1 gap-4">
                  {siteConfig.nav.links.map((link, index) => (
                    <motion.div
                      key={link.id}
                      initial={{
                        opacity: 0,
                        y: -30,
                        filter: 'blur(10px)',
                        clipPath: 'inset(100% 0% 0% 0%)',
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: 'blur(0px)',
                        clipPath: 'inset(0% 0% 0% 0%)',
                      }}
                      transition={{
                        delay: index * 0.1,
                        duration: 0.6,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {link.submenu ? (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`item-${link.id}`} className="border-none">
                            <AccordionTrigger className="text-xl font-medium uppercase py-3 hover:no-underline px-0">
                              {link.name}
                            </AccordionTrigger>
                            <AccordionContent className="data-[state=closed]:animate-none! data-[state=open]:animate-none! overflow-hidden text-sm">
                              <ul className="grid grid-cols-1 gap-6 overflow-hidden pt-4">
                                {link.submenu.map((item, itemIndex) => (
                                  <motion.li
                                    key={item.id}
                                    className=""
                                    initial={{
                                      opacity: 0,
                                      y: -20,
                                      filter: 'blur(8px)',
                                    }}
                                    animate={{
                                      opacity: 1,
                                      y: 0,
                                      filter: 'blur(0px)',
                                    }}
                                    transition={{
                                      delay: itemIndex * 0.08,
                                      duration: 0.4,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    <a
                                      href={item.href}
                                      onClick={onClose}
                                      className="flex items-start gap-3 transition-colors"
                                    >
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted border border-border rounded-lg">
                                        {item.icon}
                                      </div>
                                      <div className="flex-1 space-y-1">
                                        <h3 className="text-sm font-medium text-foreground">
                                          {item.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                          {item.description}
                                        </p>
                                      </div>
                                    </a>
                                  </motion.li>
                                ))}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      ) : (
                        <a
                          href={link.href}
                          onClick={onClose}
                          className="block px-0 py-3 text-xl font-medium uppercase transition-colors hover:text-accent-foreground"
                        >
                          {link.name}
                        </a>
                      )}
                    </motion.div>
                  ))}
                </div>
              </nav>
              <div className="sticky bottom-0 w-full p-6 bg-background border-t border-border">
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 30,
                    filter: 'blur(10px)',
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    filter: 'blur(0px)',
                  }}
                  transition={{
                    delay: 0.1,
                    duration: 0.6,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <Button
                    asChild
                    onClick={onClose}
                    className="w-full rounded-[2px] bg-[#005f8f] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#004d73]"
                  >
                    <a href={siteConfig.ctaHref} target="_blank" rel="noopener">
                      {siteConfig.cta}
                    </a>
                  </Button>
                </motion.div>
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 30,
                    filter: 'blur(10px)',
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    filter: 'blur(0px)',
                  }}
                  transition={{
                    delay: 0.2,
                    duration: 0.6,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="mt-4 w-full px-0 py-3 text-center"
                >
                  <p className="text-sm text-muted-foreground">
                    Need agents, consulting, or our blog?{' '}
                    <a
                      href="https://sigvelo.com"
                      target="_blank"
                      rel="noopener"
                      onClick={onClose}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Visit SigVelo
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Navbar() {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 10) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  return (
    <motion.header
      initial={{ y: 0 }}
      animate={{ y: isVisible ? 0 : -100 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed top-0 left-0 right-0 z-50 border-b bg-background"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5 text-lg font-semibold">
          <img src="/mcp-b-logo.svg" alt="" width="28" height="28" aria-hidden="true" />
          <span>MCP-B</span>
          <span className="text-sm font-normal text-muted-foreground">
            by{' '}
            <a
              href="https://sigvelo.com"
              target="_blank"
              rel="noopener"
              className="hover:text-foreground transition-colors"
            >
              SigVelo
            </a>
          </span>
        </a>

        <DesktopNav />

        <div className="flex items-center gap-2">
          <HamburgerButton
            isOpen={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          />
        </div>
      </div>

      <MobileNav isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </motion.header>
  );
}
