import React, { useState } from 'react';

const faqData = [
  {
    question: "What is a Joiner Tour?",
    answer: "A Joiner is a solo traveler or small group who shares a tour package with others—splitting transport and accommodation costs."
  },
  {
    question: "How do I book and pay for a tour?",
    answer: "Browse an available tour, fill out the required details, and securely pay via GCash to confirm your slot instantly."
  },
  {
    question: "Are deposits refundable?",
    answer: "We follow a non-refundable deposit policy to protect both our travelers and organizers. Please check specific trip terms before booking."
  },
  {
    question: "Will I receive a reminder before the trip?",
    answer: "Yes! An automatic email reminder is sent to you 24 hours before your departure."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-16 px-6 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">Frequently Asked Questions</h2>
        <p className="text-gray-600 mt-2">Got questions about joining our tours? We've got answers.</p>
      </div>

      <div className="space-y-4">
        {faqData.map((faq, index) => (
          <div 
            key={index} 
            className="border border-gray-200 rounded-lg overflow-hidden shadow-sm transition-all"
          >
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full flex justify-between items-center p-5 text-left font-semibold text-gray-800 bg-white hover:bg-gray-50 focus:outline-none"
            >
              <span>{faq.question}</span>
              <span className="text-xl font-bold text-gray-500">
                {openIndex === index ? '−' : '+'}
              </span>
            </button>
            {openIndex === index && (
              <div className="p-5 bg-gray-50 text-gray-600 border-t border-gray-100">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}