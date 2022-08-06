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
	mailinglistDialog.style.left = buttonRect.left + 10 +"px";
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