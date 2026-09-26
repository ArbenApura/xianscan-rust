//! TIES A CHILD PROCESS'S LIFETIME TO THIS PROCESS (FEAT-002 ADR-004), SO A CRASHED OR KILLED
//! XIANSCAN NEVER LEAVES AN ORPHANED NODE SERVER HOLDING THE WEB PORT.
//!
//! - WINDOWS: EVERY CHILD JOINS ONE PROCESS-WIDE JOB OBJECT WITH KILL_ON_JOB_CLOSE. THE JOB HANDLE IS
//!   NEVER CLOSED EXPLICITLY; WHEN THIS PROCESS DIES FOR ANY REASON THE OS CLOSES IT AND KILLS EVERY
//!   PROCESS IN THE JOB, INCLUDING GRANDCHILDREN (`cmd /C yarn dev` STARTS `node` FOR VITE).
//! - LINUX: PR_SET_PDEATHSIG DELIVERS SIGTERM TO THE CHILD WHEN THE SPAWNING THREAD EXITS.
//! - EVERY PLATFORM (THE ONLY MECHANISM ON MACOS): WITH `watchdog`, THE CHILD'S STDIN IS A PIPE WE
//!   NEVER WRITE TO AND `XIANSCAN_PARENT_WATCHDOG=1` IS SET. THE NODE SERVER EXITS WHEN THE PIPE
//!   CLOSES, WHICH HAPPENS WHEN THIS PROCESS DIES. THE `ChildStdin` STAYS INSIDE THE `Child`
//!   (NEVER `take()` IT), SO IT CLOSES EXACTLY WHEN THE CHILD IS REAPED OR THIS PROCESS EXITS.

use std::process::{Child, Command, Stdio};

/// PREPARES `cmd` BEFORE `spawn`. CALL `bind_child` RIGHT AFTER A SUCCESSFUL SPAWN.
pub fn configure_command(cmd: &mut Command, watchdog: bool) {
    if watchdog {
        cmd.stdin(Stdio::piped()).env("XIANSCAN_PARENT_WATCHDOG", "1");
    }
    #[cfg(target_os = "linux")]
    linux::set_parent_death_signal(cmd);
}

/// PUTS A FRESHLY SPAWNED CHILD UNDER THIS PROCESS'S LIFETIME. A NO-OP OFF WINDOWS.
pub fn bind_child(child: &Child) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        windows_job::assign(child)
    }
    #[cfg(not(windows))]
    {
        let _ = child;
        Ok(())
    }
}

#[cfg(windows)]
mod windows_job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// THE RAW JOB HANDLE. ONLY USED FOR ASSIGN CALLS, WHICH ARE THREAD-SAFE.
    struct Job(HANDLE);
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    static JOB: OnceLock<Result<Job, String>> = OnceLock::new();

    fn create_job() -> Result<Job, String> {
        unsafe {
            let handle = CreateJobObjectW(None, PCWSTR::null()).map_err(|e| e.to_string())?;
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
            .map_err(|e| e.to_string())?;
            Ok(Job(handle))
        }
    }

    pub fn assign(child: &Child) -> anyhow::Result<()> {
        let job = match JOB.get_or_init(create_job) {
            Ok(job) => job,
            Err(e) => anyhow::bail!("could not create the child job object: {e}"),
        };
        unsafe { AssignProcessToJobObject(job.0, HANDLE(child.as_raw_handle())) }
            .map_err(|e| anyhow::anyhow!("could not add the child to the job object: {e}"))
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use std::os::unix::process::CommandExt;
    use std::process::Command;

    /// PDEATHSIG FIRES WHEN THE *THREAD* THAT SPAWNED THE CHILD EXITS, NOT THE PROCESS. NEVER SPAWN
    /// A GUARDED CHILD FROM `spawn_blocking` (THOSE THREADS EXIT AFTER 10 S IDLE AND WOULD KILL IT).
    pub fn set_parent_death_signal(cmd: &mut Command) {
        let parent = std::process::id() as libc::pid_t;
        unsafe {
            cmd.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                // THE PARENT DIED BETWEEN fork AND prctl: THE SIGNAL WILL NEVER COME, SO DO NOT START
                if libc::getppid() != parent {
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, "parent process already exited"));
                }
                Ok(())
            });
        }
    }
}
