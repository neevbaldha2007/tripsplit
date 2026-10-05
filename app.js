// Store the current trip name.
let tripName = "";

// Store member objects in an array.
const members = [];

// Give each new member a unique ID during this page session.
let nextMemberId = 1;

// Find the HTML elements that our code will use.
const tripForm = document.getElementById("trip-form");
const tripInput = document.getElementById("trip-name");
const currentTrip = document.getElementById("current-trip");

const memberForm = document.getElementById("member-form");
const memberInput = document.getElementById("member-name");
const memberList = document.getElementById("member-list");
const memberCount = document.getElementById("member-count");
const emptyMessage = document.getElementById("empty-message");
const message = document.getElementById("message");

// Run this function when the trip form is submitted.
tripForm.addEventListener("submit", function (event) {
    // Stop the browser from reloading the page.
    event.preventDefault();

    // Remove spaces from the start and end.
    const name = tripInput.value.trim();

    // Reject names containing only spaces.
    if (name === "") {
        message.textContent = "Please enter a valid trip name.";
        return;
    }

    // Save the name and display it.
    tripName = name;
    currentTrip.textContent = tripName;

    message.textContent = "Trip name updated.";
});

// Run this function when the member form is submitted.
memberForm.addEventListener("submit", function (event) {
    event.preventDefault();

    // Require a trip name before adding members.
    if (tripName === "") {
        message.textContent = "Please set your trip name first.";
        return;
    }

    const name = memberInput.value.trim();

    if (name === "") {
        message.textContent = "Please enter a valid member name.";
        return;
    }

    // Check for an existing name, ignoring capitalisation.
    const alreadyExists = members.some(function (member) {
        return member.name.toLowerCase() === name.toLowerCase();
    });

    if (alreadyExists) {
        message.textContent =
            "This name already exists. Use a surname or nickname.";
        return;
    }

    // Create an object representing the new member.
    const newMember = {
        id: nextMemberId,
        name: name
    };

    // Add the object to the array.
    members.push(newMember);

    // Prepare a different ID for the next member.
    nextMemberId = nextMemberId + 1;

    // Clear the input and put the cursor back in it.
    memberInput.value = "";
    memberInput.focus();

    message.textContent = name + " added.";

    // Update the visible list.
    renderMembers();
});

// Draw the member list using the current array.
function renderMembers() {
    // Remove the old displayed list.
    memberList.replaceChildren();

    // Update the count.
    memberCount.textContent = members.length;

    // Hide the empty-list message when members exist.
    emptyMessage.hidden = members.length > 0;

    // Create one list item for each member.
    members.forEach(function (member) {
        const listItem = document.createElement("li");
        listItem.className = "member-row";

        const nameLabel = document.createElement("span");
        nameLabel.textContent = member.name;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-button";
        removeButton.textContent = "Remove";

        removeButton.setAttribute(
            "aria-label",
            "Remove " + member.name
        );

        // Remember which member this button belongs to.
        removeButton.addEventListener("click", function () {
            removeMember(member.id);
        });

        listItem.appendChild(nameLabel);
        listItem.appendChild(removeButton);

        memberList.appendChild(listItem);
    });
}

// Remove one member using their ID.
function removeMember(memberId) {
    const index = members.findIndex(function (member) {
        return member.id === memberId;
    });

    // Stop if the member was not found.
    if (index === -1) {
        return;
    }

    const removedName = members[index].name;

    // Remove one item at the matching position.
    members.splice(index, 1);

    message.textContent = removedName + " removed.";

    renderMembers();
}

// Draw the initial empty list.
renderMembers();