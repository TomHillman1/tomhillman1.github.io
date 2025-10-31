<script lang="ts">
    import ExperienceCard from './ExperienceCard.svelte';
</script>
<h1>Tom Hillman</h1>
<h2>A software engineer based in south-east London</h2>

<div class="grid grid-cols-3 items-stretch gap-4 pt-5">
  <div class="col-span-2 h-full">
    <ExperienceCard title="Remundo" paragraph = 
    "In July 2022, I joined XML International as a Junior Developer, working on the Remundo team.  Our mission was to develop an automated web platform that enables international businesses to hire team members from over 120 countries. In early 2023, I was promoted to Intermediate Software Developer, expanding my responsibilities beyond software implementation and production monitoring."
     />
  </div>
  <div class="h-full">
    <ExperienceCard title="Digitized Vinyl" paragraph = 
    "In 2025, I developed a personal project to digitize and catalogue my vinyl collection. This web application allows users to search and listen to my collection vinyl records, complete with cover art and metadata. The project showcases my skills in full-stack development, API integration, and user interface design."
    />
  </div>
  <div class="h-full">
    <ExperienceCard title="Microsoft Certified: Azure Fundamentals" paragraph = 
    "In 2023, I completed AZ-900, Microsoft's Azure Fundamentals certification. This certification validates foundational knowledge of cloud services and how those services are provided with Microsoft Azure, as well as basic practical skills needed to work with cloud-based solutions and services."
    />
  </div>
  <div class="col-span-2 h-full">
    <ExperienceCard title="Openalmz" paragraph = 
    "In September of 2021, I acquired my first position as a Software Engineer for Openalmz under the role of Digital Product Development Intern. Working primarily on the Mobile App, I used the SOLID principles of OOP to create new pop-ups, pages, API functionality and improved the performance of the App." 
    />
  </div>  
  <div class="h-full">
    <ExperienceCard title="Facial Recognition for Attendance - A Dissertation" paragraph = 
    "My dissertation, written in my third year of study at the University of Northampton, explored the possibility of using facial recognition to control access to a building and provide attendance tracking data to a building manager or employer."
    />
  </div>
  <div class="h-full"><ExperienceCard title="AI in Medicine - An Essay" paragraph = 
    "In 2021, I explored the merits of artificial intelligence within the healthcare, wellness, and medicine industry. Enveloping topics such as Deep Medicine and AI-driven search engines, alongside notable uses of AI in Medicine, this report discusses how specific advanced AI techniques can and will be used to improve the lives of medical practitioners and patients."
    />
  </div>

  <div class="h-full">
    <ExperienceCard title="My Education in Computing" paragraph = 
    "I have a GCSE, A-Level, and 1st Class Bachelor's degree in Computing. My A-Levels included Computer Science, Mathematics, and Physics, which provided a strong foundation in both theoretical and practical aspects of computing. I graduated with a Bachelor's degree in Computer Science from the University of Northampton in 2022, where I gained comprehensive knowledge and hands-on experience in software development, algorithms, data structures, and system design."
    />
  </div>
</div>
