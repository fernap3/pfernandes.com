const mailinglistDialog = document.getElementById("mailinglist-dialog");
const mailingListButton = document.getElementById("mailinglist-link");
const closeDialogButton = document.getElementById("mailinglist-cancel");
const mailingListForm = document.getElementById("mailinglist-form");
mailingListButton.onclick = () => showMailinglistModal();
mailinglistDialog.onmousedown = (evt) => handleDialogClick(evt);
closeDialogButton.onclick = () => mailinglistDialog.close();
mailingListForm.onsubmit = () => {
	const name = document.getElementById("mailinglist-name").value;
	const email = document.getElementById("mailinglist-email").value;
	mailingListSignup(name, email);
};

function showMailinglistModal()
{
	const buttonRect = mailingListButton.getBoundingClientRect();
	mailinglistDialog.style.top = buttonRect.bottom + 10 + "px";

	if (window.innerWidth > 410)
		mailinglistDialog.style.left = buttonRect.left + 10 +"px";
	else
		mailinglistDialog.style.left = "10px";
	
	mailinglistDialog.showModal();
}

function handleDialogClick(evt)
{
	const dialogRect = mailinglistDialog.getBoundingClientRect();
	if (evt.clientY < dialogRect.top || evt.clientY > dialogRect.bottom || evt.clientX < dialogRect.left || evt.clientX > dialogRect.right)
		mailinglistDialog.close();
}

async function mailingListSignup(name, email)
{
	mailingListButton.disabled = true;

	try
	{
		const response = await fetch("/mailing-list/subscribe", {
			method: "POST",
			body: JSON.stringify({name, email}),
			headers: {
				"Content-Type": "application/json",
			}
		});

		if (!response.ok)
		{
			console.log(`${response.status} ${response.statusText}: ${await response.text()}`)
			return;
		}
	}
	finally
	{
		mailingListButton.disabled = false;
	}
}

const hamburgerButton = document.getElementById("hamburger-button");
const sideMenu = document.getElementById("side-menu");
hamburgerButton.onclick = () => toggleMenu();
let menuShown = false;

function toggleMenu()
{
	sideMenu.show();
	const animation = sideMenu.animate([
		{
			transform: menuShown ? "none" : "translateX(-50vw)",
		},
		{
			transform: menuShown ? "translateX(-50vw)" : "none",
		}
	],
		{
			duration: 300,
			easing: "cubic-bezier(0.4, 0.0, 0.2, 1)",
			fill: "both",
		}
	);

	menuShown = !menuShown;

	animation.onfinish = () => {
		if (!menuShown)
			sideMenu.close();
	};


	const content = document.getElementById("content");

	if (menuShown)
	{
		requestAnimationFrame(() => requestAnimationFrame(() => {
			document.onclick = evt => {
				if (evt.clientX > window.innerWidth / 2)
					toggleMenu();
			};
		}));
		
		document.body.classList.add("menu-shown");
		
		if (content)
			content.inert = true;
	}
	else
	{
		document.onclick = null;
		document.body.classList.remove("menu-shown");

		if (content)
			content.inert = false;
	}
}